package com.docuflex.ai.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.docuflex.ai.api.dto.DocumentResponse;
import com.docuflex.ai.domain.DocumentFormatCategory;
import com.docuflex.ai.domain.DocumentRecord;
import com.docuflex.ai.repo.DocumentRecordRepository;

import jakarta.annotation.PostConstruct;

@Service
public class DocumentService {

    private static final long MAX_BYTES = 24L * 1024 * 1024;
    private static final Set<String> ALLOWED_EXT =
            Set.of("pdf", "docx", "txt", "png", "jpg", "jpeg", "gif", "webp");
    private static final String OWNER_LOCAL = "local";

    private final DocumentRecordRepository repository;
    private final TextExtractor textExtractor;
    private final DocumentExportService exportService;
    private final AiService aiService;
    private final S3Service s3Service;

    @Value("${docuflex.storage.dir:uploads}")
    private String storageDirProperty;

    private Path storageRoot;

    public DocumentService(
            DocumentRecordRepository repository,
            TextExtractor textExtractor,
            DocumentExportService exportService,
            AiService aiService,
            S3Service s3Service) {
        this.repository = repository;
        this.textExtractor = textExtractor;
        this.exportService = exportService;
        this.aiService = aiService;
        this.s3Service = s3Service;
    }

    @PostConstruct
    void ensureStorage() throws IOException {
        storageRoot = Paths.get(storageDirProperty).toAbsolutePath().normalize();
        Files.createDirectories(storageRoot);
    }

    public List<DocumentResponse> listAll() {
        return repository.findAllByOrderByUpdatedAtDesc().stream().map(DocumentResponse::from).toList();
    }

    public List<DocumentResponse> listAllForUser(String email) {
        return repository.findByOwnerUserId(email).stream()
                .map(DocumentResponse::from)
                .toList();
    }

    public DocumentResponse get(String id) {
        return DocumentResponse.from(load(id));
    }

    public Resource asResource(String id) {
        DocumentRecord r = load(id);
        Path p = resolveFile(r);
        if (!Files.isRegularFile(p)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "File missing on disk");
        }
        return new FileSystemResource(p);
    }

    public DocumentResponse upload(MultipartFile file, String email) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Empty file");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "File too large (max 24 MB)");
        }
        String original = file.getOriginalFilename();
        if (original == null || original.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Filename required");
        }
        String safe = safeFileName(original);
        String ext = extension(safe).toLowerCase();
        if (!ALLOWED_EXT.contains(ext)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Allowed types: PDF, DOCX, TXT, PNG, JPG, JPEG, GIF, WEBP");
        }
        DocumentFormatCategory cat = detectCategory(ext);
        String id = UUID.randomUUID().toString();
        String storageKey = id + "/" + safe;
        Path dest = storageRoot.resolve(storageKey);
        try {
            Files.createDirectories(dest.getParent());
            file.transferTo(dest);
            if (s3Service.isS3Enabled()) {
                s3Service.uploadFile(storageKey, dest);
            }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store file", e);
        }
        String text;
        try {
            text = textExtractor.extract(dest, cat);
        } catch (IOException e) {
            deleteQuiet(dest);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read file: " + e.getMessage(), e);
        }
        DocumentRecord r = new DocumentRecord();
        r.setId(id);
        r.setTitle(safe);
        r.setOriginalFilename(safe);
        r.setOwnerUserId(email); // CORRECT OWNERSHIP
        r.setStorageKey(storageKey);
        r.setMimeType(guessMime(ext, file.getContentType()));
        r.setSizeBytes(file.getSize());
        r.setFormatCategory(cat);
        r.setTextContent(text);
        repository.save(r);
        return DocumentResponse.from(r);
    }

    public DocumentResponse updateText(String id, String text) {
        DocumentRecord r = load(id);
        r.setTextContent(text != null ? text : "");
        repository.save(r);
        return DocumentResponse.from(r);
    }

    public DocumentResponse generateAiSummary(String id) {
        DocumentRecord r = load(id);
        String summary = aiService.summarize(r.getTextContent());
        r.setAiSummary(summary);
        repository.save(r);
        return DocumentResponse.from(r);
    }

    public String parseCommand(String command) {
        return aiService.parseIntent(command);
    }

    public String chatWithDocument(String id, String question) {
        DocumentRecord r = load(id);
        return aiService.chat(r.getTextContent(), question);
    }

    public String generateFromDocument(String id, String instruction) {
        DocumentRecord r = load(id);
        return aiService.generate(r.getTextContent(), instruction);
    }

    public DocumentResponse generateAiOcr(String id) {
        DocumentRecord r = load(id);
        if (r.getFormatCategory() != com.docuflex.ai.domain.DocumentFormatCategory.IMAGE) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "OCR only supported for images");
        }
        Path path = resolveFile(r);
        try {
            byte[] bytes = java.nio.file.Files.readAllBytes(path);
            String text = aiService.ocrImage(bytes, r.getMimeType());
            r.setTextContent(text);
            repository.save(r);
            return DocumentResponse.from(r);
        } catch (java.io.IOException e) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "Could not read image file", e);
        }
    }

    public DocumentResponse convertAndStore(String sourceId, String targetFormat, Double compression, Double resize) {
        DocumentRecord src = load(sourceId);
        Path srcPath = resolveFile(src);
        byte[] outBytes;
        try {
            outBytes = exportService.export(
                    src.getFormatCategory(), srcPath, src.getTextContent(), targetFormat, compression, resize);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Conversion failed: " + e.getMessage(), e);
        }
        String upper = targetFormat.toUpperCase();
        String newExt = upper.toLowerCase();
        String base = stripExtension(src.getOriginalFilename());
        // Clean up redundant "converted" tags
        if (base.endsWith("_converted")) {
            base = base.substring(0, base.length() - 10);
        }
        String newName = base + "_converted." + newExt;
        String newId = UUID.randomUUID().toString();
        String storageKey = newId + "/" + safeFileName(newName);
        Path dest = storageRoot.resolve(storageKey);
        try {
            Files.createDirectories(dest.getParent());
            Files.write(dest, outBytes);
            if (s3Service.isS3Enabled()) {
                s3Service.uploadFile(storageKey, dest);
            }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not write converted file", e);
        }
        DocumentFormatCategory newCat = categoryForTarget(upper);
        String text;
        try {
            text = textExtractor.extract(dest, newCat);
        } catch (IOException e) {
            deleteQuiet(dest);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Converted file could not be read back", e);
        }
        DocumentRecord out = new DocumentRecord();
        out.setId(newId);
        out.setTitle(newName);
        out.setOriginalFilename(newName);
        out.setOwnerUserId(src.getOwnerUserId()); // Preserve Ownership!
        out.setStorageKey(storageKey);
        out.setMimeType(mimeForTarget(upper));
        out.setSizeBytes(outBytes.length);
        out.setFormatCategory(newCat);
        out.setTextContent(text);
        out.setConvertedFromId(sourceId);
        repository.save(out);
        return DocumentResponse.from(out);
    }

    public byte[] getPreview(String id, Double compression, Double resize) {
        DocumentRecord r = load(id);
        Path path = resolveFile(r);
        try {
            return exportService.generatePreview(r.getFormatCategory(), path, r.getTextContent(), compression, resize);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not generate preview", e);
        }
    }

    public void delete(String id) {
        DocumentRecord r = load(id);
        Path path = resolveFile(r);
        System.out.println("Deleting document: " + id + " at path: " + path);
        repository.deleteById(id);
        deleteQuiet(path);
        if (s3Service.isS3Enabled()) {
            s3Service.deleteFile(r.getStorageKey());
        }
        try {
            Path parent = path.getParent();
            if (parent != null && Files.isDirectory(parent)) {
                try (var stream = Files.list(parent)) {
                    if (stream.findAny().isEmpty()) {
                        System.out.println("Cleaning up empty directory: " + parent);
                        Files.deleteIfExists(parent);
                    }
                }
            }
        } catch (IOException e) {
            System.err.println("Cleanup failed for " + id + ": " + e.getMessage());
        }
    }

    private DocumentRecord load(String id) {
        return repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private Path resolveFile(DocumentRecord r) {
        Path p = storageRoot.resolve(r.getStorageKey()).normalize();
        if (!p.startsWith(storageRoot)) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Invalid storage path");
        }
        
        if (!Files.exists(p) && s3Service.isS3Enabled()) {
            try {
                System.out.println("Syncing file from S3: " + r.getStorageKey());
                byte[] bytes = s3Service.downloadFile(r.getStorageKey());
                if (bytes != null) {
                    Files.createDirectories(p.getParent());
                    Files.write(p, bytes);
                }
            } catch (IOException e) {
                System.err.println("Could not sync from S3: " + e.getMessage());
            }
        }
        return p;
    }

    private static String safeFileName(String name) {
        String base = Paths.get(name).getFileName().toString();
        return base.replaceAll("[^a-zA-Z0-9._\\-]", "_");
    }

    private static String extension(String filename) {
        int i = filename.lastIndexOf('.');
        if (i < 0) {
            return "";
        }
        return filename.substring(i + 1);
    }

    private static String stripExtension(String filename) {
        int i = filename.lastIndexOf('.');
        if (i <= 0) {
            return filename;
        }
        return filename.substring(0, i);
    }

    private static DocumentFormatCategory detectCategory(String ext) {
        return switch (ext.toLowerCase()) {
            case "pdf" -> DocumentFormatCategory.PDF;
            case "docx" -> DocumentFormatCategory.DOCX;
            case "txt" -> DocumentFormatCategory.TXT;
            case "png", "jpg", "jpeg", "gif", "webp" -> DocumentFormatCategory.IMAGE;
            default -> DocumentFormatCategory.TXT;
        };
    }

    private static String guessMime(String ext, String fromClient) {
        if (fromClient != null
                && !fromClient.isBlank()
                && !"application/octet-stream".equalsIgnoreCase(fromClient)) {
            return fromClient;
        }
        return switch (ext.toLowerCase()) {
            case "pdf" -> "application/pdf";
            case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "txt" -> "text/plain; charset=UTF-8";
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "webp" -> "image/webp";
            default -> "application/octet-stream";
        };
    }

    private static String mimeForTarget(String upper) {
        return switch (upper) {
            case "TXT" -> "text/plain; charset=UTF-8";
            case "PDF" -> "application/pdf";
            case "DOCX" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            default -> "application/octet-stream";
        };
    }

    private static DocumentFormatCategory categoryForTarget(String upper) {
        return switch (upper) {
            case "TXT" -> DocumentFormatCategory.TXT;
            case "PDF" -> DocumentFormatCategory.PDF;
            case "DOCX" -> DocumentFormatCategory.DOCX;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported format");
        };
    }

    private static void deleteQuiet(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignored) {
            // ignore
        }
    }
}
