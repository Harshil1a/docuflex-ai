# Stage 1: Build the React frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Spring Boot backend
FROM maven:3.9.6-eclipse-temurin-21 AS backend-build
WORKDIR /app
# Copy the frontend build artifacts to the backend static resources
COPY --from=frontend-build /app/frontend/dist /app/backend/src/main/resources/static
# Copy backend source
COPY backend/pom.xml /app/backend/
COPY backend/src /app/backend/src
WORKDIR /app/backend
RUN mvn clean package -DskipTests

# Stage 3: Final Production Image
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=backend-build /app/backend/target/*.jar app.jar

# Standard Spring Boot port
EXPOSE 8080

# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
