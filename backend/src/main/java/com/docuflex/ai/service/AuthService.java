package com.docuflex.ai.service;

import com.docuflex.ai.model.UserEntity;
import com.docuflex.ai.repository.UserRepository;
import com.docuflex.ai.security.JwtUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.Optional;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private EmailService emailService;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Value("${docuflex.admin.key}")
    private String systemAdminKey;

    public UserEntity register(String email, String password, String name, String adminKey) {
        if (userRepository.findByEmail(email).isPresent()) {
            throw new RuntimeException("Email already registered. Please login instead.");
        }
        
        UserEntity user = new UserEntity(email, passwordEncoder.encode(password), name);
        
        // Logical check for Admin status
        boolean isFirstUser = userRepository.count() == 0;
        boolean isKeyProvided = adminKey != null && !adminKey.isBlank();
        boolean isKeyCorrect = isKeyProvided && adminKey.trim().equals(systemAdminKey);
        
        if (isFirstUser || isKeyCorrect) {
            user.setRole("ADMIN");
        } else {
            user.setRole("USER");
        }
        
        return userRepository.save(user);
    }

    public String login(String email, String password) {
        UserEntity user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("Invalid email or password");
        }

        String token = jwtUtils.generateToken(email, user.getRole());
        
        // Async email alert (best effort)
        try {
            new Thread(() -> emailService.sendLoginAlert(email)).start();
        } catch (Exception e) {
            // Ignore thread errors
        }
        
        return token;
    }
    
    public Optional<UserEntity> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }
}
