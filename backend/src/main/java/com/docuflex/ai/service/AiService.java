package com.docuflex.ai.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.*;
import java.util.*;

@Service
public class AiService {

    @Value("${groq.api.key:${GROQ_API_KEY:}}")
    private String apiKey;

    private final RestTemplate restTemplate = new RestTemplate();

    private static final String GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
    private static final String TEXT_MODEL = "llama-3.3-70b-versatile";
    private static final String VISION_MODEL = "llama-3.2-11b-vision-preview";

    public String summarize(String text) {
        if (apiKey == null || apiKey.isBlank()) {
            return "AI Summary is unavailable: Please set GROQ_API_KEY.";
        }
        if (text == null || text.isBlank()) {
            return "No text provided for summarization.";
        }

        String prompt = "Summarize the following document content ultra-concisely. " +
                "Provide a 2-sentence overview followed by 3 short key bullet points. " +
                "Keep it very brief. Document content:\n\n" + text;
        return callGroq(prompt, TEXT_MODEL);
    }

    public String extractInsights(String text) {
        if (apiKey == null || apiKey.isBlank()) {
            return "AI Insights are unavailable: Please set GROQ_API_KEY.";
        }
        String prompt = "Provide a deep-dive analysis of the following text. List 5-7 sophisticated insights, themes, or critical takeaways:\n\n" + text;
        return callGroq(prompt, TEXT_MODEL);
    }

    public String chat(String context, String question) {
        if (apiKey == null || apiKey.isBlank()) {
            return "AI Chat is unavailable: Please set GROQ_API_KEY.";
        }
        Map<String, Object> requestBody = Map.of(
            "model", TEXT_MODEL,
            "messages", List.of(
                Map.of("role", "system", "content", "You are a helpful document assistant. Use the provided context to answer the user's questions accurately. If the answer isn't in the context, say you don't know based on the document."),
                Map.of("role", "user", "content", "Context:\n" + context + "\n\nQuestion: " + question)
            )
        );
        return executeRequest(requestBody);
    }

    public String generate(String context, String instruction) {
        if (apiKey == null || apiKey.isBlank()) {
            return "AI Generation is unavailable: Please set GROQ_API_KEY.";
        }
        String prompt = "Using the following document as a reference:\n\n" + context + "\n\nInstruction: " + instruction;
        return callGroq(prompt, TEXT_MODEL);
    }

    public String parseIntent(String command) {
        if (apiKey == null || apiKey.isBlank()) {
            return "{\"error\": \"AI Unavailable\"}";
        }
        String systemPrompt = "You are a command parser for DocuFlex AI. " +
                "Available Actions: CONVERT, SUMMARIZE, OPTIMIZE, SEARCH, THEME, LOGOUT. " +
                "Available Formats: PDF, DOCX, TXT. " +
                "Scope: ALL, SELECTED. " +
                "Flags: DOWNLOAD (boolean). " +
                "Map the user command to JSON: " +
                "{\"action\":\"string\", \"target\":\"string\", \"format\":\"string\", \"download\":boolean, \"searchTerm\":\"string\"}. " +
                "Return ONLY raw JSON.";
        
        Map<String, Object> requestBody = Map.of(
            "model", TEXT_MODEL,
            "messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", "User Command: " + command)
            ),
            "response_format", Map.of("type", "json_object")
        );
        return executeRequest(requestBody);
    }

    public String ocrImage(byte[] imageBytes, String mimeType) {
        if (apiKey == null || apiKey.isBlank()) {
            return "OCR is unavailable: Please set GROQ_API_KEY.";
        }
        
        String base64Image = Base64.getEncoder().encodeToString(imageBytes);
        String dataUrl = "data:" + mimeType + ";base64," + base64Image;

        Map<String, Object> requestBody = Map.of(
            "model", VISION_MODEL,
            "messages", List.of(
                Map.of("role", "user", "content", List.of(
                    Map.of("type", "text", "text", "Extract all text from this image accurately. Return only the extracted text."),
                    Map.of("type", "image_url", "image_url", Map.of("url", dataUrl))
                ))
            )
        );

        return executeRequest(requestBody);
    }

    private String callGroq(String prompt, String model) {
        Map<String, Object> requestBody = Map.of(
            "model", model,
            "messages", List.of(
                Map.of("role", "user", "content", prompt)
            )
        );
        return executeRequest(requestBody);
    }

    private String executeRequest(Map<String, Object> requestBody) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(GROQ_URL, entity, Map.class);
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                List choices = (List) response.getBody().get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map choice = (Map) choices.get(0);
                    Map message = (Map) choice.get("message");
                    return (String) message.get("content");
                }
            }
            return "Error: Could not parse AI response.";
        } catch (Exception e) {
            return "Groq AI Error: " + e.getMessage();
        }
    }
}
