package jp.pixieed.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.annotation.Nullable;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PiXiEEDMediaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

@CapacitorPlugin(
    name = "PiXiEEDMedia",
    permissions = {
        @Permission(
            strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE },
            alias = "galleryWrite"
        )
    }
)
class PiXiEEDMediaPlugin extends Plugin {
    private static final String GALLERY_WRITE_ALIAS = "galleryWrite";
    private static final String DEFAULT_FILENAME = "PiXiEED.png";
    private static final String GALLERY_SUBDIRECTORY = Environment.DIRECTORY_PICTURES + "/PiXiEED";

    @PluginMethod
    public void saveImageToLibrary(PluginCall call) {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
            && getPermissionState(GALLERY_WRITE_ALIAS) != PermissionState.GRANTED) {
            requestPermissionForAlias(GALLERY_WRITE_ALIAS, call, "galleryPermissionCallback");
            return;
        }
        performSave(call);
    }

    @PermissionCallback
    private void galleryPermissionCallback(PluginCall call) {
        if (getPermissionState(GALLERY_WRITE_ALIAS) != PermissionState.GRANTED) {
            call.reject("Gallery permission not granted");
            return;
        }
        performSave(call);
    }

    private void performSave(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Missing image data");
            return;
        }
        String mimeType = normalizeMimeType(call.getString("mimeType"));
        if (mimeType == null) {
            call.reject("Unsupported image type");
            return;
        }
        String filename = sanitizeFilename(call.getString("filename"));
        byte[] bytes;
        try {
            bytes = Base64.decode(stripDataUrlPrefix(data), Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("Invalid image data", error);
            return;
        }
        if (bytes == null || bytes.length == 0) {
            call.reject("Invalid image data");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            saveToLegacyGallery(call, bytes, filename, mimeType);
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, GALLERY_SUBDIRECTORY);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri itemUri = null;
        try {
            itemUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (itemUri == null) {
                call.reject("Failed to create gallery entry");
                return;
            }
            try (OutputStream output = resolver.openOutputStream(itemUri, "w")) {
                if (output == null) {
                    throw new IllegalStateException("Could not open gallery output stream");
                }
                output.write(bytes);
                output.flush();
            }

            ContentValues completed = new ContentValues();
            completed.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(itemUri, completed, null, null);

            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("uri", itemUri.toString());
            result.put("filename", filename);
            result.put("mimeType", mimeType);
            call.resolve(result);
        } catch (Exception error) {
            if (itemUri != null) {
                try {
                    resolver.delete(itemUri, null, null);
                } catch (Exception ignored) {
                    // Ignore cleanup failures.
                }
            }
            call.reject("Failed to save image to gallery", error);
        }
    }

    private void saveToLegacyGallery(PluginCall call, byte[] bytes, String filename, String mimeType) {
        File picturesRoot = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
        File outputDir = new File(picturesRoot, "PiXiEED");
        if (!outputDir.exists() && !outputDir.mkdirs()) {
            call.reject("Failed to create gallery directory");
            return;
        }
        File outputFile = new File(outputDir, filename);
        try (FileOutputStream stream = new FileOutputStream(outputFile, false)) {
            stream.write(bytes);
            stream.flush();
        } catch (Exception error) {
            call.reject("Failed to save image to gallery", error);
            return;
        }
        MediaScannerConnection.scanFile(
            getContext(),
            new String[] { outputFile.getAbsolutePath() },
            new String[] { mimeType },
            (path, uri) -> {
                JSObject result = new JSObject();
                result.put("saved", true);
                result.put("uri", uri != null ? uri.toString() : Uri.fromFile(outputFile).toString());
                result.put("filename", filename);
                result.put("mimeType", mimeType);
                call.resolve(result);
            }
        );
    }

    @Nullable
    private String normalizeMimeType(@Nullable String rawMimeType) {
        String mimeType = rawMimeType == null ? "" : rawMimeType.trim().toLowerCase();
        if (!mimeType.startsWith("image/") || "image/svg+xml".equals(mimeType)) {
            return null;
        }
        return mimeType.isEmpty() ? "image/png" : mimeType;
    }

    private String stripDataUrlPrefix(String value) {
        int commaIndex = value.indexOf(',');
        return commaIndex >= 0 ? value.substring(commaIndex + 1) : value;
    }

    private String sanitizeFilename(@Nullable String rawFilename) {
        String filename = rawFilename == null ? "" : rawFilename.trim();
        int lastSlash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
        if (lastSlash >= 0) {
            filename = filename.substring(lastSlash + 1);
        }
        filename = filename.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", "_").trim();
        return filename.isEmpty() ? DEFAULT_FILENAME : filename;
    }
}
