package com.docuflex.ai.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Path;

@Service
public class S3Service {

    @Value("${aws.s3.bucket:}")
    private String bucketName;

    @Value("${aws.s3.region:us-east-1}")
    private String region;

    @Value("${aws.s3.access-key:}")
    private String accessKey;

    @Value("${aws.s3.secret-key:}")
    private String secretKey;

    @Value("${docuflex.storage.mode:local}")
    private String storageMode;

    private S3Client s3Client;

    @PostConstruct
    public void init() {
        if ("s3".equalsIgnoreCase(storageMode)) {
            this.s3Client = S3Client.builder()
                    .region(Region.of(region))
                    .credentialsProvider(StaticCredentialsProvider.create(
                            AwsBasicCredentials.create(accessKey, secretKey)))
                    .build();
        }
    }

    public void uploadFile(String key, Path filePath) {
        if (!"s3".equalsIgnoreCase(storageMode)) {
            System.out.println("S3 upload skipped: Storage mode is " + storageMode);
            return;
        }
        
        try {
            System.out.println("Attempting S3 upload: Bucket=" + bucketName + ", Key=" + key);
            PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build();

            s3Client.putObject(putObjectRequest, RequestBody.fromFile(filePath));
            System.out.println("[S3 SUCCESS] File uploaded to: " + key);
        } catch (Exception e) {
            System.err.println("[S3 ERROR] Failed to upload to S3: " + e.getMessage());
            e.printStackTrace();
        }
    }

    public void deleteFile(String key) {
        if (!"s3".equalsIgnoreCase(storageMode)) return;
        
        try {
            System.out.println("Deleting from S3: " + key);
            software.amazon.awssdk.services.s3.model.DeleteObjectRequest deleteObjectRequest = 
                software.amazon.awssdk.services.s3.model.DeleteObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build();

            s3Client.deleteObject(deleteObjectRequest);
            System.out.println("[S3 DELETE SUCCESS] File removed from cloud.");
        } catch (Exception e) {
            System.err.println("[S3 DELETE ERROR] Failed to remove from S3: " + e.getMessage());
        }
    }
    
    public byte[] downloadFile(String key) throws IOException {
        if (!"s3".equalsIgnoreCase(storageMode)) return null;

        GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .build();

        return s3Client.getObjectAsBytes(getObjectRequest).asByteArray();
    }
    
    public boolean isS3Enabled() {
        return "s3".equalsIgnoreCase(storageMode);
    }
}
