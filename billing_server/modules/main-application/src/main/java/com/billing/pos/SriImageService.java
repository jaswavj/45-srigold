package com.billing.pos;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class SriImageService {

    private static final long MAX_BYTES = 2 * 1024 * 1024;
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final Set<String> ALLOWED_TYPES = Set.of(
            "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"
    );

    @Value("${app.images-dir:}")
    private String configuredDir;

    public Path directory() {
        Path dir = resolveDir();
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new RuntimeException("Could not create sri_images folder at " + dir);
        }
        return dir;
    }

    public String save(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new RuntimeException("Select an image to upload");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new RuntimeException("Image is too large. Compress and try again.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (!contentType.isBlank() && !ALLOWED_TYPES.contains(contentType) && !contentType.startsWith("image/")) {
            throw new RuntimeException("Only image files can be uploaded");
        }
        String fileName = "sri_" + STAMP.format(LocalDateTime.now()) + "_"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 8) + extension(file, contentType);
        Path target = directory().resolve(fileName).normalize();
        if (!target.startsWith(directory())) {
            throw new RuntimeException("Invalid image path");
        }
        try {
            Files.copy(file.getInputStream(), target);
        } catch (IOException e) {
            throw new RuntimeException("Could not save image");
        }
        return fileName;
    }

    public Resource load(String fileName) {
        String safe = safeName(fileName);
        Path file = directory().resolve(safe).normalize();
        if (!file.startsWith(directory()) || !Files.isRegularFile(file)) {
            throw new RuntimeException("Image not found");
        }
        return new FileSystemResource(file);
    }

    public MediaType mediaType(String fileName) {
        String lower = safeName(fileName).toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) {
            return MediaType.IMAGE_PNG;
        }
        if (lower.endsWith(".webp")) {
            return MediaType.parseMediaType("image/webp");
        }
        return MediaType.IMAGE_JPEG;
    }

    public static String safeName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            throw new RuntimeException("Image not found");
        }
        String name = Path.of(fileName).getFileName().toString();
        if (!name.matches("[A-Za-z0-9._-]+")) {
            throw new RuntimeException("Image not found");
        }
        return name;
    }

    private Path resolveDir() {
        if (configuredDir != null && !configuredDir.isBlank()) {
            return Path.of(configuredDir.trim()).toAbsolutePath().normalize();
        }
        Path cwd = Path.of(System.getProperty("user.dir", ".")).toAbsolutePath().normalize();
        Path walk = cwd;
        for (int i = 0; i < 10 && walk != null; i++) {
            if (Files.isDirectory(walk.resolve("billing_client")) || Files.isDirectory(walk.resolve("sri_images"))) {
                return walk.resolve("sri_images");
            }
            walk = walk.getParent();
        }
        return cwd.resolve("sri_images");
    }

    private static String extension(MultipartFile file, String contentType) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
        if (original.endsWith(".png")) {
            return ".png";
        }
        if (original.endsWith(".webp")) {
            return ".webp";
        }
        if (contentType.contains("png")) {
            return ".png";
        }
        if (contentType.contains("webp")) {
            return ".webp";
        }
        return ".jpg";
    }
}
