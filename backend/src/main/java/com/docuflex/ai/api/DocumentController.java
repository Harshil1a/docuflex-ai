package com.docuflex.ai.api;

import java.nio.charset.StandardCharsets;
import java.security.Principal;

import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.docuflex.ai.api.dto.ConvertFormatRequest;
import com.docuflex.ai.api.dto.DocumentResponse;
import com.docuflex.ai.api.dto.UpdateTextRequest;
import com.docuflex.ai.service.DocumentService;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import java.util.*;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping
    public List<DocumentResponse> list(Principal principal) {
        return documentService.listAllForUser(principal.getName());
    }

    @PostMapping("/parse-command")
    public String parseCommand(@RequestBody Map<String, String> request) {
        return documentService.parseCommand(request.get("command"));
    }

    @GetMapping("/{id}")
    public DocumentResponse get(@PathVariable String id) {
        return documentService.get(id);
    }

    @GetMapping("/{id}/file")
    public ResponseEntity<Resource> download(
            @PathVariable String id, @RequestParam(name = "download", defaultValue = "false") boolean download) {
        DocumentResponse meta = documentService.get(id);
        Resource body = documentService.asResource(id);
        MediaType mt = MediaType.parseMediaType(meta.mimeType());
        ContentDisposition disposition =
                ContentDisposition.attachment()
                        .filename(meta.originalFilename(), StandardCharsets.UTF_8)
                        .build();
        ContentDisposition inline =
                ContentDisposition.inline()
                        .filename(meta.originalFilename(), StandardCharsets.UTF_8)
                        .build();
        return ResponseEntity.ok()
                .contentType(mt)
                .header(HttpHeaders.CONTENT_DISPOSITION, (download ? disposition : inline).toString())
                .body(body);
    }

    @GetMapping("/{id}/preview")
    public ResponseEntity<byte[]> getPreview(
            @PathVariable String id,
            @RequestParam(name = "compression", defaultValue = "1.0") Double compression,
            @RequestParam(name = "resize", defaultValue = "1.0") Double resize) {
        byte[] preview = documentService.getPreview(id, compression, resize);
        if (preview == null) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Preview not available");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .body(preview);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentResponse> upload(@RequestPart("file") MultipartFile file, Principal principal) {
        DocumentResponse created = documentService.upload(file, principal.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PatchMapping("/{id}/content")
    public DocumentResponse updateContent(
            @PathVariable String id, @Valid @RequestBody UpdateTextRequest request) {
        return documentService.updateText(id, request.textContent());
    }

    @PostMapping("/{id}/convert")
    public ResponseEntity<DocumentResponse> convert(
            @PathVariable String id, @Valid @RequestBody ConvertFormatRequest request) {
        DocumentResponse created = documentService.convertAndStore(
                id, request.format(), request.compressionQuality(), request.resizeFactor());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PostMapping("/{id}/ai-summary")
    public DocumentResponse aiSummary(@PathVariable String id) {
        return documentService.generateAiSummary(id);
    }

    @PostMapping("/{id}/ai-ocr")
    public DocumentResponse aiOcr(@PathVariable String id) {
        return documentService.generateAiOcr(id);
    }

    @PostMapping("/{id}/chat")
    public Map<String, String> chat(@PathVariable String id, @RequestBody Map<String, String> request) {
        String answer = documentService.chatWithDocument(id, request.get("question"));
        return Map.of("answer", answer);
    }

    @PostMapping("/{id}/generate")
    public Map<String, String> generate(@PathVariable String id, @RequestBody Map<String, String> request) {
        String content = documentService.generateFromDocument(id, request.get("instruction"));
        return Map.of("content", content);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        documentService.delete(id);
    }
}
