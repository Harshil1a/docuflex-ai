package com.docuflex.ai.api.dto;

import java.time.Instant;

import com.docuflex.ai.domain.DocumentFormatCategory;

public record DocumentResponse(
        String id,
        String title,
        String originalFilename,
        String mimeType,
        long sizeBytes,
        DocumentFormatCategory formatCategory,
        String textContent,
        String aiSummary,
        String convertedFromId,
        Instant createdAt,
        Instant updatedAt) {

    public static DocumentResponse from(com.docuflex.ai.domain.DocumentRecord d) {
        return new DocumentResponse(
                d.getId(),
                d.getTitle(),
                d.getOriginalFilename(),
                d.getMimeType(),
                d.getSizeBytes(),
                d.getFormatCategory(),
                d.getTextContent() != null ? d.getTextContent() : "",
                d.getAiSummary(),
                d.getConvertedFromId(),
                d.getCreatedAt(),
                d.getUpdatedAt());
    }
}
