package com.docuflex.ai.api.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateTextRequest(@NotNull String textContent) {}
