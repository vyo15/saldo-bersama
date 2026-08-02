function backupFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty("BACKUP_FOLDER_ID");
  if (!id) throw sbError_("BACKUP_FOLDER_NOT_CONFIGURED", "BACKUP_FOLDER_ID belum diatur.", 503);
  return DriveApp.getFolderById(id);
}

function safeBackupName_(name) {
  var clean = cleanText_(name, 160).replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!/^saldo-bersama-backup-v3-.*\.json\.gz$/.test(clean)) throw sbError_("BACKUP_NAME_INVALID", "Nama backup tidak valid.", 400);
  return clean;
}

function fileInBackupFolder_(file, folder) {
  var parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folder.getId()) return true;
  return false;
}

function storeBackup_(payload) {
  var folder = backupFolder_();
  var fileName = safeBackupName_(payload.fileName);
  var bytes;
  try { bytes = Utilities.base64Decode(String(payload.contentBase64 || "")); } catch (ignored) { throw sbError_("BACKUP_CONTENT_INVALID", "Isi backup tidak valid.", 400); }
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw sbError_("BACKUP_SIZE_INVALID", "Ukuran backup tidak valid.", 413);
  var expectedChecksum = cleanText_(payload.checksum, 100);
  var expectedBackupId = cleanText_(payload.backupId, 100);
  var existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) {
    var candidate = existing.next();
    var description = String(candidate.getDescription() || "");
    if (description.indexOf("Checksum: " + expectedChecksum) !== -1 && description.indexOf("Backup ID: " + expectedBackupId) !== -1) {
      return { fileId: candidate.getId(), fileName: candidate.getName(), size: candidate.getSize(), createdAt: candidate.getDateCreated().toISOString(), reused: true };
    }
    throw sbError_("BACKUP_NAME_CONFLICT", "Nama backup sudah dipakai oleh isi yang berbeda.", 409);
  }
  var file = folder.createFile(Utilities.newBlob(bytes, "application/gzip", fileName));
  file.setDescription("Saldo Bersama backup v3\nChecksum: " + expectedChecksum + "\nBackup ID: " + expectedBackupId);
  return { fileId: file.getId(), fileName: file.getName(), size: file.getSize(), createdAt: new Date().toISOString(), reused: false };
}

function readBackup_(payload) {
  var folder = backupFolder_();
  var file = DriveApp.getFileById(cleanText_(payload.fileId, 200));
  if (!fileInBackupFolder_(file, folder)) throw sbError_("BACKUP_FOLDER_MISMATCH", "File bukan bagian dari folder backup Saldo Bersama.", 403);
  safeBackupName_(file.getName());
  if (file.getSize() > 20 * 1024 * 1024) throw sbError_("BACKUP_TOO_LARGE", "Backup terlalu besar untuk diproses.", 413);
  return { fileId: file.getId(), fileName: file.getName(), contentBase64: Utilities.base64Encode(file.getBlob().getBytes()) };
}
