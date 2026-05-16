package com.docuflex.ai.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record ConvertFormatRequest(
        @NotNull
                @Pattern(
                        regexp = "(?i)(PDF|DOCX|TXT)",
                        message = "format must be PDF, DOCX, or TXT")
                String format,
        Double compressionQuality,
        Double resizeFactor) {}
