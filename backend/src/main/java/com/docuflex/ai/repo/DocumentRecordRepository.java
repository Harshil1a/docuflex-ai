package com.docuflex.ai.repo;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.docuflex.ai.domain.DocumentRecord;

public interface DocumentRecordRepository extends MongoRepository<DocumentRecord, String> {

    List<DocumentRecord> findAllByOrderByUpdatedAtDesc();
    List<DocumentRecord> findByOwnerUserId(String ownerUserId);
}
