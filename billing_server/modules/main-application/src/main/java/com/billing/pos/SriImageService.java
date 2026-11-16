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
import java.util.ArrayList;
import java.util.List;
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

    private volatile Path cachedDir;

    public Path directory() {
        if (cachedDir != null) {
            return cachedDir;
        }
        synchronized (this) {
            if (cachedDir != null) {
                return cachedDir;
            }
            List<Path> tried = new ArrayList<>();
            for (Path candidate : candidates()) {
                if (candidate == null) {
                    continue;
                }
                Path dir = candidate.toAbsolutePath().normalize();
                tried.add(dir);
                if (canWrite(dir)) {
                    cachedDir = dir;
                    return dir;
                }
            }
            throw new RuntimeException(writeHint(tried.isEmpty() ? null : tried.get(0),
                    "sri_images is not writable. Tried: " + tried));
        }
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
            throw new RuntimeException(writeHint(target.getParent(), "Could not save image to " + directory()));
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

    private List<Path> candidates() {
        List<Path> dirs = new ArrayList<>();
        add(dirs, configuredDir);
        add(dirs, System.getenv("SRI_IMAGES_DIR"));
        add(dirs, System.getenv("APP_IMAGES_DIR"));
        Path cwd = Path.of(System.getProperty("user.dir", ".")).toAbsolutePath().normalize();
        Path near = findNear(cwd);
        if (near != null) {
            dirs.add(near);
        }
        Path catalinaBase = toPath(System.getProperty("catalina.base"));
        Path catalinaHome = toPath(System.getProperty("catalina.home"));
        addSibling(dirs, catalinaBase, "webapps", "sri_images");
        addSibling(dirs, catalinaHome, "webapps", "sri_images");
        addSibling(dirs, cwd, "webapps", "sri_images");
        if (!isEphemeralCatalina(catalinaBase)) {
            addSibling(dirs, catalinaBase, "sri_images");
        }
        if (!isEphemeralCatalina(catalinaHome)) {
            addSibling(dirs, catalinaHome, "sri_images");
        }
        dirs.add(Path.of(System.getProperty("java.io.tmpdir", "/tmp")).resolve("sri_images"));
        return dirs;
    }

    private static boolean isEphemeralCatalina(Path catalina) {
        if (catalina == null) {
            return true;
        }
        String path = catalina.toAbsolutePath().normalize().toString().replace('\\', '/').toLowerCase(Locale.ROOT);
        return path.contains("/temp/tomcat.") || path.contains("/tmp/tomcat.");
    }

    private static void add(List<Path> dirs, String value) {
        if (value != null && !value.isBlank()) {
            dirs.add(Path.of(value.trim()));
        }
    }

    private static void addSibling(List<Path> dirs, Path home, String... parts) {
        if (home == null) {
            return;
        }
        Path path = home.toAbsolutePath().normalize();
        for (String part : parts) {
            path = path.resolve(part);
        }
        dirs.add(path);
    }

    private static boolean canWrite(Path dir) {
        try {
            Files.createDirectories(dir);
            Path probe = dir.resolve(".sri_write_" + UUID.randomUUID());
            Files.writeString(probe, "ok");
            Files.deleteIfExists(probe);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static Path toPath(String value) {
        return value == null || value.isBlank() ? null : Path.of(value);
    }

    private static Path findNear(Path... roots) {
        for (Path root : roots) {
            if (root == null) {
                continue;
            }
            Path walk = root.toAbsolutePath().normalize();
            for (int i = 0; i < 8 && walk != null && walk.getNameCount() > 0; i++) {
                Path images = walk.resolve("sri_images");
                if (Files.isDirectory(images) || Files.isDirectory(walk.resolve("billing_client"))
                        || Files.isDirectory(walk.resolve("sri"))) {
                    return images;
                }
                walk = walk.getParent();
            }
        }
        return null;
    }

    private static String writeHint(Path dir, String message) {
        String user = System.getProperty("user.name", "tomcat");
        String path = dir == null ? "/opt/tomcat/webapps/sri_images" : dir.toString();
        return message + ". Tomcat is running as '" + user + "'. In FileZilla set sri_images permission to 777, or SSH: "
                + "sudo chown -R " + user + ":" + user + " " + path + " && sudo chmod 777 " + path;
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
