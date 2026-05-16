package com.docuflex.ai.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {
    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);

    @Autowired(required = false)
    private JavaMailSender mailSender;

    public void sendLoginAlert(String toEmail) {
        if (mailSender == null) {
            logger.warn("Mail sender not configured. Skipping email to {}", toEmail);
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(toEmail);
            message.setSubject("Login Alert");
            message.setText("You have successfully logged in to your account on DocuFlex AI.");
            mailSender.send(message);
            logger.info("Login alert email sent to {}", toEmail);
        } catch (Exception e) {
            logger.error("Failed to send login email to {}: {}", toEmail, e.getMessage());
        }
    }
}
