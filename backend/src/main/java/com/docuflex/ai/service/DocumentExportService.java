package com.docuflex.ai.service;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.springframework.stereotype.Component;

import com.docuflex.ai.domain.DocumentFormatCategory;

import org.apache.pdfbox.rendering.PDFRenderer;
import javax.imageio.IIOImage;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.plugins.jpeg.JPEGImageWriteParam;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.util.Iterator;

@Component
public class DocumentExportService {

    private static final float MARGIN = 50;
    private static final float FONT_SIZE = 11;
    private static final float LEADING = 14;

    public byte[] toTxtBytes(String text) {
        return (text != null ? text : "").getBytes(StandardCharsets.UTF_8);
    }

    public byte[] textToPdf(String text) throws IOException {
        String body = text != null ? text : "";
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            List<String> lines = wrapLines(body, 95);
            writeTextPages(doc, font, lines);
            doc.save(out);
            return out.toByteArray();
        }
    }

    private void writeTextPages(PDDocument doc, PDType1Font font, List<String> lines) throws IOException {
        List<String> all = lines.isEmpty() ? List.of("") : lines;
        int idx = 0;
        while (idx < all.size()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            float y = page.getMediaBox().getHeight() - MARGIN;
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                while (idx < all.size() && y >= MARGIN) {
                    String safe = sanitizePdfLine(all.get(idx).isEmpty() ? " " : all.get(idx));
                    cs.beginText();
                    cs.setFont(font, FONT_SIZE);
                    cs.newLineAtOffset(MARGIN, y);
                    cs.showText(safe);
                    cs.endText();
                    y -= LEADING;
                    idx++;
                }
            }
        }
    }

    /** PDF text operators are picky; strip unsupported chars for Type1. */
    private String sanitizePdfLine(String line) {
        StringBuilder sb = new StringBuilder(line.length());
        for (char c : line.toCharArray()) {
            if (c >= 32 && c <= 126) {
                sb.append(c);
            } else if (c == '\t') {
                sb.append(' ');
            } else {
                sb.append(' ');
            }
        }
        return sb.toString();
    }

    private List<String> wrapLines(String body, int maxChars) {
        List<String> out = new ArrayList<>();
        for (String raw : body.split("\\R", -1)) {
            String s = raw;
            while (s.length() > maxChars) {
                out.add(s.substring(0, maxChars));
                s = s.substring(maxChars);
            }
            out.add(s);
        }
        if (out.isEmpty()) {
            out.add("");
        }
        return out;
    }

    public byte[] textToDocx(String text) throws IOException {
        try (XWPFDocument doc = new XWPFDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            String body = text != null ? text : "";
            for (String para : body.split("\\R", -1)) {
                XWPFParagraph p = doc.createParagraph();
                XWPFRun run = p.createRun();
                run.setText(para);
            }
            doc.write(out);
            return out.toByteArray();
        }
    }

    public byte[] imageToPdf(Path imagePath, Double compression, Double resize) throws IOException {
        BufferedImage image = ImageIO.read(imagePath.toFile());
        if (image == null) {
            throw new IOException("Unsupported or corrupt image");
        }

        if (resize != null && resize > 0 && resize < 1.0) {
            image = resizeImage(image, resize);
        }

        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            
            PDImageXObject pdImage;
            if (compression != null && compression > 0 && compression < 1.0) {
                byte[] compressed = compressImage(image, compression);
                pdImage = PDImageXObject.createFromByteArray(doc, compressed, "compressed.jpg");
            } else {
                pdImage = toPdImage(doc, imagePath, image);
            }

            float pageW = page.getMediaBox().getWidth() - 2 * MARGIN;
            float pageH = page.getMediaBox().getHeight() - 2 * MARGIN;
            float iw = pdImage.getWidth();
            float ih = pdImage.getHeight();
            float scale = Math.min(pageW / iw, pageH / ih);
            float w = iw * scale;
            float h = ih * scale;
            float x = MARGIN + (pageW - w) / 2;
            float y = MARGIN + (pageH - h) / 2;
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(pdImage, x, y, w, h);
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    private BufferedImage resizeImage(BufferedImage original, double factor) {
        int w = (int) (original.getWidth() * factor);
        int h = (int) (original.getHeight() * factor);
        if (w < 1) w = 1;
        if (h < 1) h = 1;
        
        BufferedImage resized = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = resized.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(original, 0, 0, w, h, null);
        g.dispose();
        return resized;
    }

    private byte[] compressImage(BufferedImage image, double quality) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
        if (!writers.hasNext()) throw new IOException("No JPEG writers found");
        
        ImageWriter writer = writers.next();
        try (var ios = ImageIO.createImageOutputStream(baos)) {
            writer.setOutput(ios);
            ImageWriteParam param = writer.getDefaultWriteParam();
            if (param.canWriteCompressed()) {
                param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                param.setCompressionQuality((float) quality);
            }
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return baos.toByteArray();
    }

    private PDImageXObject toPdImage(PDDocument doc, Path imagePath, BufferedImage image) throws IOException {
        String lower = imagePath.getFileName().toString().toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return JPEGFactory.createFromImage(doc, image);
        }
        return LosslessFactory.createFromImage(doc, image);
    }

    public byte[] generatePreview(DocumentFormatCategory category, Path path, String text, Double compression, Double resize) throws IOException {
        System.out.println("Generating preview for category: " + category + " at path: " + path);
        BufferedImage image = null;
        try {
            if (category == DocumentFormatCategory.IMAGE) {
                image = ImageIO.read(path.toFile());
            } else if (category == DocumentFormatCategory.PDF) {
                try (PDDocument doc = Loader.loadPDF(path.toFile())) {
                    if (doc.getNumberOfPages() > 0) {
                        PDFRenderer renderer = new PDFRenderer(doc);
                        image = renderer.renderImageWithDPI(0, 72); 
                    } else {
                        System.err.println("PDF has 0 pages");
                    }
                }
            } else {
                // For TXT/DOCX, render text to image
                System.out.println("Rendering text preview for " + category);
                image = new BufferedImage(600, 800, BufferedImage.TYPE_INT_RGB);
                Graphics2D g = image.createGraphics();
                g.setColor(Color.WHITE);
                g.fillRect(0, 0, 600, 800);
                g.setColor(Color.BLACK);
                g.setFont(new Font("Serif", Font.PLAIN, 12));
                String content = text != null ? text : "";
                String[] lines = content.split("\\R");
                int y = 40;
                for (int i = 0; i < Math.min(lines.length, 40); i++) {
                    g.drawString(lines[i], 40, y);
                    y += 15;
                }
                g.dispose();
            }
        } catch (Exception e) {
            System.err.println("Failed to read/render document for preview: " + e.getMessage());
            e.printStackTrace();
        }

        if (image == null) {
            System.err.println("Preview image is null after processing");
            return null;
        }

        // Apply resize
        if (resize != null && resize > 0 && resize < 1.0) {
            image = resizeImage(image, resize);
        }

        // Apply compression
        if (compression != null && compression > 0 && compression < 1.0) {
            return compressImage(image, compression);
        } else {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(image, "jpg", baos);
            return baos.toByteArray();
        }
    }

    public byte[] export(
            DocumentFormatCategory source,
            Path originalFile,
            String editedText,
            String targetFormat,
            Double compression,
            Double resize) throws IOException {
        String fmt = targetFormat.toUpperCase();
        return switch (fmt) {
            case "TXT" -> toTxtBytes(editedText);
            case "PDF" -> {
                if (source == DocumentFormatCategory.IMAGE) {
                    yield imageToPdf(originalFile, compression, resize);
                }
                yield textToPdf(editedText);
            }
            case "DOCX" -> textToDocx(editedText);
            default -> throw new IllegalArgumentException("Unsupported target: " + targetFormat);
        };
    }
}
