import multer from 'multer';
import fs from "fs";


// SETUP: Ensure upload folder exists
const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

export const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only PDFs and images are allowed"));
        }
    }
});


const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ALLOWED MIME TYPES
const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];


// COMMON FILE FILTER
const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only JPG, PNG, JPEG, and WEBP images are allowed."), false);
    }
};


// Simple multer configuration
export const singleUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
});