package com.docuflex.ai.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Component;

import com.docuflex.ai.domain.DocumentFormatCategory;

@Component
public class TextExtractor {

    public static final String IMAGE_PLACEHOLDER =
            "Optional notes for this image. (No text is extracted from image files.)";

    public String extract(Path path, DocumentFormatCategory category) throws IOException {
        return switch (category) {
            case PDF -> extractPdf(path);
            case DOCX -> extractDocx(path);
            case TXT -> Files.readString(path, StandardCharsets.UTF_8);
            case IMAGE -> IMAGE_PLACEHOLDER;
        };
    }

    private String extractPdf(Path path) throws IOException {
        try (PDDocument doc = Loader.loadPDF(path.toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            String text = stripper.getText(doc);
            return text != null ? text : "";
        }
    }

    private String extractDocx(Path path) throws IOException {
        try (XWPFDocument doc = new XWPFDocument(Files.newInputStream(path));
                XWPFWordExtractor extractor = new XWPFWordExtractor(doc)) {
            String text = extractor.getText();
            return text != null ? text : "";
        }
    }
}
