package com.docuflex.ai.api;

import com.docuflex.ai.model.UserEntity;
import com.docuflex.ai.repository.UserRepository;
import com.docuflex.ai.repo.DocumentRecordRepository;
import com.docuflex.ai.domain.DocumentRecord;
import com.docuflex.ai.service.DocumentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private DocumentRecordRepository documentRepository;

    @Autowired
    private DocumentService documentService;

    @GetMapping("/users")
    public List<Map<String, Object>> getAllUsers() {
        List<UserEntity> users = userRepository.findAll();
        return users.stream().map(u -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", u.getId());
            map.put("name", u.getName());
            map.put("email", u.getEmail());
            map.put("role", u.getRole());
            
            long storage = documentRepository.findByOwnerUserId(u.getEmail()).stream()
                    .mapToLong(DocumentRecord::getSizeBytes)
                    .sum();
            map.put("storageUsed", storage);
            return map;
        }).collect(Collectors.toList());
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable String id) {
        UserEntity user = userRepository.findById(id).orElse(null);
        if (user != null) {
            // 1. Find and delete all documents belonging to this user's email
            List<DocumentRecord> userDocs = documentRepository.findByOwnerUserId(user.getEmail());
            for (DocumentRecord doc : userDocs) {
                documentService.delete(doc.getId());
            }
            // 2. Delete the user account
            userRepository.deleteById(id);
        }
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/users/{id}/clear-data")
    public ResponseEntity<?> clearUserData(@PathVariable String id) {
        userRepository.findById(id).ifPresent(user -> {
            List<DocumentRecord> userDocs = documentRepository.findByOwnerUserId(user.getEmail());
            for (DocumentRecord doc : userDocs) {
                documentService.delete(doc.getId());
            }
        });
        return ResponseEntity.ok().build();
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalUsers", userRepository.count());
        stats.put("totalDocuments", documentRepository.count());
        
        long totalBytes = documentRepository.findAll().stream()
                .mapToLong(DocumentRecord::getSizeBytes)
                .sum();
        stats.put("totalStorageUsed", totalBytes);
        
        return stats;
    }

    @DeleteMapping("/documents/{id}")
    public ResponseEntity<?> deleteDocument(@PathVariable String id) {
        documentService.delete(id);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/documents/clear-all")
    public ResponseEntity<?> clearAllDocuments() {
        // Use documentService.delete for EACH document to ensure S3 is cleared
        List<DocumentRecord> all = documentRepository.findAll();
        for (DocumentRecord r : all) {
            try {
                documentService.delete(r.getId());
            } catch (Exception e) {
                // If it fails (maybe already gone from S3), just remove from DB
                documentRepository.deleteById(r.getId());
            }
        }
        return ResponseEntity.ok().build();
    }
}
