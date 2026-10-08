/**
 * SISTEM INFORMASI SARANA DAN PRASARANA SEKOLAH (SAPRAS)
 * SMA NEGERI 1 SEUNUDDON
 * Backend Google Apps Script (Code.gs)
 * Single Source of Truth: Google Spreadsheet
 * File & Dokumentasi: Google Drive
 */

const CONFIG = {
  // Ganti dengan ID Spreadsheet Anda jika menggunakan database terpisah
  // Atau biarkan kosong untuk menggunakan Spreadsheet tempat skrip ini terpasang (jika container-bound)
  SPREADSHEET_ID: "1af7oglFHIvqt3v0zdR5dGbqA-FiXwQY1txkJdhkKYvc", 
  ROOT_FOLDER_ID: "", // ID Folder Root Drive (dibuat otomatis oleh setupDrive)
  TIMEZONE: "Asia/Jakarta",
  APP_NAME: "SAPRAS SMA NEGERI 1 SEUNUDDON",
  TOKEN_SECRET: "SAPRAS_SMAN1_SEUNUDDON_SECURE_TOKEN_2026"
};

// Nama-nama Sheet Database
const SHEETS = {
  USERS: "Users",
  SETTINGS: "Settings",
  ASET: "Aset",
  KATEGORI: "KategoriBarang",
  LOKASI: "Lokasi",
  MUTASI: "Mutasi",
  PEMINJAMAN: "Peminjaman",
  PEMELIHARAAN: "Pemeliharaan",
  PENGHAPUSAN: "Penghapusan",
  AUDIT: "AuditLog"
};

function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.trim() !== "" && CONFIG.SPREADSHEET_ID !== "ISI_ID_SPREADSHEET") {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getTimestamp() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

function hashPassword(str) {
  if (!str) return "";
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  let hexString = "";
  for (let i = 0; i < rawHash.length; i++) {
    let byteVal = rawHash[i];
    if (byteVal < 0) byteVal += 256;
    let byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = "0" + byteHex;
    hexString += byteHex;
  }
  return hexString;
}

function jsonResponse(data, status = "success", message = "") {
  const output = {
    status: status,
    message: message,
    data: data,
    timestamp: getTimestamp()
  };
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    // Catatan: harus cek e.parameter.action langsung, bukan hanya e.parameter -
    // Apps Script selalu mengisi e.parameter sebagai objek (meski kosong) untuk GET,
    // jadi "e && e.parameter" selalu truthy walau tidak ada ?action=... di URL.
    // Itu sebabnya membuka /exec polos di browser sebelumnya menghasilkan
    // 'Action GET undefined tidak dikenali' padahal seharusnya dianggap 'ping'.
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ping";
    
    if (action === "ping") {
      return jsonResponse({
        appName: CONFIG.APP_NAME,
        status: "online",
        serverTime: getTimestamp()
      }, "success", "Server Google Apps Script aktif dan terhubung.");
    }
    
    if (action === "getSettings") {
      return jsonResponse(getSettingsData());
    }

    if (action === "syncData" || action === "getAllData") {
      return jsonResponse(getAllDataSync());
    }
    
    if (action === "getAssets") {
      return jsonResponse(getAssetsData());
    }
    
    if (action === "getCategories") {
      return jsonResponse(getCategoriesData());
    }
    
    if (action === "getLocations") {
      return jsonResponse(getLocationsData());
    }

    if (action === "getDashboard") {
      return jsonResponse(getDashboardData());
    }

    return jsonResponse(null, "error", "Action GET '" + action + "' tidak dikenali.");
  } catch (err) {
    return jsonResponse(null, "error", err.toString());
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action;
    const userRole = payload.currentUserRole || "GUEST";
    const userId = payload.currentUserId || "system";
    const userName = payload.currentUserName || "System";

    function requireRole(allowedRoles) {
      if (!allowedRoles.includes(userRole)) {
        throw new Error("Akses ditolak: Anda tidak memiliki wewenang untuk tindakan ini.");
      }
    }

    switch (action) {
      case "login":
        return jsonResponse(handleLogin(payload.username, payload.password));

      case "getDashboard":
        return jsonResponse(getDashboardData());

      case "getAssets":
        return jsonResponse(getAssetsData());

      case "getKIBList":
        return jsonResponse(getKIBList());

      case "getKIBData":
        return jsonResponse(getKIBData(payload.filters || {}));

      case "getKIRData":
        return jsonResponse(getKIRData(payload.filters || {}));

      case "getImportTemplate":
        return jsonResponse(getImportTemplateData());

      case "importAssets":
        requireRole(["ADMIN", "PETUGAS"]);
        return jsonResponse(importAssetsData(payload.rows, userId, userName), "success", "Import aset selesai.");

      case "getAssetById":
        return jsonResponse(getAssetByIdData(payload.id));

      case "saveAsset":
        requireRole(["ADMIN", "PETUGAS"]);
        return jsonResponse(saveAssetData(payload.asset, userId, userName), "success", "Data aset berhasil disimpan.");

      case "updateAsset":
        requireRole(["ADMIN", "PETUGAS"]);
        return jsonResponse(updateAssetData(payload.asset, userId, userName), "success", "Data aset berhasil diperbarui.");

      case "deleteAsset":
        requireRole(["ADMIN"]);
        return jsonResponse(deleteAssetData(payload.id, userId, userName), "success", "Status aset diubah menjadi Dihapus.");

      case "getCategories":
        return jsonResponse(getCategoriesData());

      case "saveCategory":
        requireRole(["ADMIN"]);
        return jsonResponse(saveCategoryData(payload.category, userId, userName), "success", "Kategori berhasil disimpan.");

      case "getLocations":
        return jsonResponse(getLocationsData());

      case "saveLocation":
        requireRole(["ADMIN"]);
        return jsonResponse(saveLocationData(payload.location, userId, userName), "success", "Lokasi berhasil disimpan.");

      case "saveMutation":
        requireRole(["ADMIN", "PETUGAS"]);
        return jsonResponse(saveMutationData(payload.mutation, userId, userName), "success", "Mutasi aset berhasil dicatat.");

      case "getMutations":
        return jsonResponse(getMutationsData());

      case "saveLoan":
        requireRole(["ADMIN", "PETUGAS"]);
        return jsonResponse(saveLoanData(payload.loan, userId, userName), "success", "Peminjaman aset berhasil dicatat.");

      case "returnLoan":
        requireRole(["ADMIN", "PETUGAS"]);
        return jsonResponse(returnLoanData(payload.loanId, payload.returnDate, userId, userName), "success", "Pengembalian aset berhasil dicatat.");

      case "getLoans":
        return jsonResponse(getLoansData());

      case "saveMaintenance":
        requireRole(["ADMIN", "PETUGAS"]);
        return jsonResponse(saveMaintenanceData(payload.maintenance, userId, userName), "success", "Data pemeliharaan berhasil disimpan.");

      case "getMaintenance":
        return jsonResponse(getMaintenanceData());

      case "saveDisposal":
        requireRole(["ADMIN"]);
        return jsonResponse(saveDisposalData(payload.disposal, userId, userName), "success", "Usulan penghapusan aset berhasil disimpan.");

      case "getDisposals":
        return jsonResponse(getDisposalsData());

      case "uploadFile":
        requireRole(["ADMIN", "PETUGAS"]);
        return jsonResponse(handleFileUpload(payload.fileName, payload.base64Data, payload.folderType, userId, userName), "success", "File berhasil diunggah ke Google Drive.");

      case "getSettings":
        return jsonResponse(getSettingsData());

      case "saveSettings":
        requireRole(["ADMIN"]);
        return jsonResponse(saveSettingsData(payload.settings, userId, userName), "success", "Pengaturan sekolah berhasil diperbarui.");

      case "syncData":
        return jsonResponse(getAllDataSync(), "success", "Sinkronisasi berhasil.");

      case "getUsers":
        requireRole(["ADMIN"]);
        return jsonResponse(getUsersData());

      case "saveUser":
        requireRole(["ADMIN"]);
        return jsonResponse(saveUserData(payload.user, userId, userName), "success", "Data pengguna berhasil disimpan.");

      case "setUserStatus":
        requireRole(["ADMIN"]);
        return jsonResponse(setUserStatusData(payload.targetUserId, payload.newStatus, userId, userName), "success", "Status pengguna diperbarui.");

      case "backupDatabase":
        requireRole(["ADMIN"]);
        return jsonResponse(backupDatabaseToDrive(userId, userName), "success", "Backup spreadsheet berhasil dibuat di Google Drive.");

      case "getAuditLogs":
        requireRole(["ADMIN"]);
        return jsonResponse(getAuditLogsData());

      default:
        return jsonResponse(null, "error", "Aksi tidak dikenali: " + action);
    }
  } catch (error) {
    return jsonResponse(null, "error", error.toString());
  } finally {
    lock.releaseLock();
  }
}

function setupDatabase() {
  const ss = getSpreadsheet();
  
  ensureSheetWithHeaders(ss, SHEETS.USERS, [
    "ID", "Username", "PasswordHash", "Nama", "Role", "Status", "CreatedAt", "LastLogin"
  ]);

  ensureSheetWithHeaders(ss, SHEETS.SETTINGS, [
    "Key", "Value", "UpdatedAt"
  ]);

  ensureSheetWithHeaders(ss, SHEETS.ASET, [
    "ID", "KodeBarang", "NamaBarang", "KategoriID", "Kategori", "NUP", "Merk", "Type",
    "Spesifikasi", "TahunPerolehan", "SumberDana", "HargaPerolehan", "Jumlah", "Satuan",
    "Kondisi", "Status", "LokasiID", "Lokasi", "PenanggungJawab", "TanggalInput", "InputBy",
    "UpdatedAt", "FotoFileID", "FotoURL", "Keterangan", "KIB"
  ]);

  ensureSheetWithHeaders(ss, SHEETS.KATEGORI, [
    "ID", "KodeKategori", "NamaKategori", "Keterangan", "Status", "CreatedAt", "UpdatedAt"
  ]);

  ensureSheetWithHeaders(ss, SHEETS.LOKASI, [
    "ID", "KodeLokasi", "NamaLokasi", "Gedung", "Lantai", "PenanggungJawab", "Status", "Keterangan"
  ]);

  ensureSheetWithHeaders(ss, SHEETS.MUTASI, [
    "ID", "AsetID", "Tanggal", "LokasiAsal", "LokasiTujuan", "PenanggungJawabLama",
    "PenanggungJawabBaru", "Alasan", "InputBy", "CreatedAt"
  ]);

  ensureSheetWithHeaders(ss, SHEETS.PEMINJAMAN, [
    "ID", "AsetID", "TanggalPinjam", "TanggalKembali", "Peminjam", "Keperluan",
    "Jumlah", "Status", "InputBy", "CreatedAt"
  ]);

  ensureSheetWithHeaders(ss, SHEETS.PEMELIHARAAN, [
    "ID", "AsetID", "Tanggal", "JenisPerbaikan", "Deskripsi", "Biaya", "Vendor",
    "Status", "TanggalSelesai", "InputBy", "Keterangan"
  ]);

  ensureSheetWithHeaders(ss, SHEETS.PENGHAPUSAN, [
    "ID", "AsetID", "Tanggal", "Alasan", "Kondisi", "Nilai", "DokumenPendukung", "Status", "InputBy"
  ]);

  ensureSheetWithHeaders(ss, SHEETS.AUDIT, [
    "ID", "Timestamp", "UserID", "NamaUser", "Action", "Module", "RecordID", "Description"
  ]);

  seedInitialData(ss);
  Logger.log("Setup Database berhasil diselesaikan.");
}

function ensureSheetWithHeaders(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    headers.forEach(h => {
      if (!existing.includes(h)) sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
    });
  }
  const range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setFontWeight("bold");
  range.setBackground("#1e3a8a");
  range.setFontColor("#ffffff");
  return sheet;
}

function seedInitialData(ss) {
  const settingsSheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (settingsSheet.getLastRow() <= 1) {
    const defaultSettings = [
      ["NamaSekolah", "SMA NEGERI 1 SEUNUDDON", getTimestamp()],
      ["AlamatSekolah", "Jl. Teupin Kuyun - Seunuddon", getTimestamp()],
      ["Desa", "Ulee Rubek Barat", getTimestamp()],
      ["Kecamatan", "Seunuddon", getTimestamp()],
      ["Kabupaten", "Aceh Utara", getTimestamp()],
      ["Provinsi", "Aceh", getTimestamp()],
      ["NPSN", "10103138", getTimestamp()],
      ["Email", "sman1seunuddon@gmail.com", getTimestamp()],
      ["Telepon", "(0645) 892011", getTimestamp()],
      ["JamOperasional", "07.30 - 16.00 WIB", getTimestamp()],
      ["NamaKepalaSekolah", "Drs. H. Muhammad Nasir, M.Pd.", getTimestamp()],
      ["NIPKepalaSekolah", "19680512 199412 1 002", getTimestamp()],
      ["NamaPengurusBarang", "Iskandar, S.Pd.", getTimestamp()],
      ["NIPPengurusBarang", "19820315 200801 1 007", getTimestamp()],
      ["NamaDinas", "DINAS PENDIDIKAN ACEH", getTimestamp()],
      ["NamaPemerintah", "PEMERINTAH ACEH", getTimestamp()],
      ["NamaWakaSarpras", "", getTimestamp()],
      ["NIPWakaSarpras", "", getTimestamp()],
      ["LogoSekolahURL", "https://images.unsplash.com/photo-1594608661623-aa0bd3a69d98?w=160&q=80", getTimestamp()],
      ["LogoDaerahURL", "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=160&q=80", getTimestamp()],
      ["GoogleDriveFolderId", CONFIG.ROOT_FOLDER_ID || "", getTimestamp()]
    ];
    defaultSettings.forEach(row => settingsSheet.appendRow(row));
  }

  const userSheet = ss.getSheetByName(SHEETS.USERS);
  if (userSheet.getLastRow() <= 1) {
    const defaultUsers = [
      ["USR-001", "admin", hashPassword("admin123"), "Administrator Sapras", "ADMIN", "Aktif", getTimestamp(), ""],
      ["USR-002", "petugas", hashPassword("petugas123"), "Petugas Sarpras", "PETUGAS", "Aktif", getTimestamp(), ""],
      ["USR-003", "kepsek", hashPassword("kepsek123"), "Kepala Sekolah", "PIMPINAN", "Aktif", getTimestamp(), ""]
    ];
    defaultUsers.forEach(row => userSheet.appendRow(row));
  }

  const katSheet = ss.getSheetByName(SHEETS.KATEGORI);
  if (katSheet.getLastRow() <= 1) {
    const defaultKat = [
      ["KAT-001", "ELK", "Elektronik", "Peralatan elektronik umum", "Aktif", getTimestamp(), getTimestamp()],
      ["KAT-002", "FUR", "Furniture", "Meja, kursi, lemari", "Aktif", getTimestamp(), getTimestamp()],
      ["KAT-003", "KOM", "Komputer & IT", "PC, Laptop, Server, Switch", "Aktif", getTimestamp(), getTimestamp()],
      ["KAT-004", "LAB", "Peralatan Laboratorium", "Alat praktikum IPA/Fisika/Biologi/Kimia", "Aktif", getTimestamp(), getTimestamp()],
      ["KAT-005", "OLR", "Peralatan Olahraga", "Bola, matras, raket, jaring", "Aktif", getTimestamp(), getTimestamp()],
      ["KAT-006", "KTR", "Peralatan Kantor", "Printer, scanner, mesin fotokopi", "Aktif", getTimestamp(), getTimestamp()],
      ["KAT-007", "KLS", "Peralatan Kelas", "Papan tulis, infocus proyektor", "Aktif", getTimestamp(), getTimestamp()],
      ["KAT-008", "BKU", "Buku & Referensi", "Buku perpustakaan, modul kurikulum", "Aktif", getTimestamp(), getTimestamp()],
      ["KAT-009", "KDN", "Kendaraan", "Kendaraan operasional sekolah", "Aktif", getTimestamp(), getTimestamp()],
      ["KAT-010", "BGN", "Bangunan & Gedung", "Gedung kelas, laboratorium, mushalla", "Aktif", getTimestamp(), getTimestamp()]
    ];
    defaultKat.forEach(row => katSheet.appendRow(row));
  }

  const lokSheet = ss.getSheetByName(SHEETS.LOKASI);
  if (lokSheet.getLastRow() <= 1) {
    const defaultLok = [
      ["LOK-001", "R-KS", "Ruang Kepala Sekolah", "Gedung Utama", "Lantai 1", "Drs. H. Muhammad Nasir, M.Pd.", "Aktif", "Ruang Pimpinan"],
      ["LOK-002", "R-GRU", "Ruang Dewan Guru", "Gedung Utama", "Lantai 1", "Koordinator Guru", "Aktif", "Ruang kerja guru"],
      ["LOK-003", "R-TU", "Ruang Tata Usaha", "Gedung Utama", "Lantai 1", "Kepala TU", "Aktif", "Administrasi sekolah"],
      ["LOK-004", "LAB-KOM", "Laboratorium Komputer", "Gedung Lab", "Lantai 2", "Guru TIK", "Aktif", "Praktik TIK & ANBK"],
      ["LOK-005", "LAB-IPA", "Laboratorium IPA", "Gedung Lab", "Lantai 1", "Laboran IPA", "Aktif", "Praktik Fisika/Kimia/Biologi"],
      ["LOK-006", "PERPUS", "Perpustakaan Sekolah", "Gedung Perpus", "Lantai 1", "Kepala Perpustakaan", "Aktif", "Layanan baca & literasi"],
      ["LOK-007", "R-KLS-X", "Ruang Kelas X-1 s/d X-4", "Gedung Pembelajaran A", "Lantai 1-2", "Wali Kelas X", "Aktif", "Kelas Reguler"],
      ["LOK-008", "R-KLS-XI", "Ruang Kelas XI-1 s/d XI-4", "Gedung Pembelajaran B", "Lantai 1-2", "Wali Kelas XI", "Aktif", "Kelas Reguler"],
      ["LOK-009", "R-KLS-XII", "Ruang Kelas XII-1 s/d XII-4", "Gedung Pembelajaran C", "Lantai 1-2", "Wali Kelas XII", "Aktif", "Kelas Reguler"],
      ["LOK-010", "GDG", "Gudang Sapras", "Gedung Belakang", "Lantai 1", "Pengurus Barang", "Aktif", "Penyimpanan aset cadangan"]
    ];
    defaultLok.forEach(row => lokSheet.appendRow(row));
  }
}

function setupDrive() {
  const rootFolderName = CONFIG.APP_NAME;
  let rootFolder;
  const existingFolders = DriveApp.getFoldersByName(rootFolderName);
  if (existingFolders.hasNext()) {
    rootFolder = existingFolders.next();
  } else {
    rootFolder = DriveApp.createFolder(rootFolderName);
  }
  
  const rootFolderId = rootFolder.getId();
  CONFIG.ROOT_FOLDER_ID = rootFolderId;

  const subFolders = [
    "Logo", "Foto Aset", "Dokumen Aset", "Bukti Pengadaan",
    "Dokumen Pemeliharaan", "Dokumen Penghapusan", "Laporan", "Backup"
  ];

  const subFolderIds = {};
  subFolders.forEach(folderName => {
    const existing = rootFolder.getFoldersByName(folderName);
    let sub = existing.hasNext() ? existing.next() : rootFolder.createFolder(folderName);
    subFolderIds[folderName] = sub.getId();
  });

  const ss = getSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (settingsSheet) {
    updateSettingValue(settingsSheet, "GoogleDriveFolderId", rootFolderId);
    updateSettingValue(settingsSheet, "GoogleDriveSubfolders", JSON.stringify(subFolderIds));
  }

  return { rootFolderId: rootFolderId, subFolders: subFolderIds };
}

function handleLogin(username, password) {
  if (!username || !password) throw new Error("Username dan password wajib diisi.");
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const data = sheet.getDataRange().getValues();
  const inputHash = hashPassword(password);
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[1].toLowerCase() === username.trim().toLowerCase()) {
      if (row[5] !== "Aktif") throw new Error("Akun Anda dinonaktifkan.");
      if (row[2] === inputHash) {
        sheet.getRange(i + 1, 8).setValue(getTimestamp());
        addAuditLog(row[0], row[3], "LOGIN", "Auth", row[0], "Pengguna berhasil masuk.");
        return {
          id: row[0],
          username: row[1],
          nama: row[3],
          role: row[4],
          token: hashPassword(row[0] + CONFIG.TOKEN_SECRET + getTimestamp())
        };
      } else {
        throw new Error("Password yang Anda masukkan salah.");
      }
    }
  }
  throw new Error("Username tidak ditemukan.");
}

function getDashboardData() {
  const assets = getAssetsData();
  const categories = getCategoriesData();
  const locations = getLocationsData();
  const loans = getLoansData();

  let totalAset = 0;
  let kondisiBaik = 0;
  let rusakRingan = 0;
  let rusakBerat = 0;
  let totalNilai = 0;
  let asetTahunIni = 0;
  const currentYear = new Date().getFullYear().toString();

  const byCondition = { "Baik": 0, "Rusak Ringan": 0, "Rusak Berat": 0 };
  const byCategory = {};
  const byLocation = {};
  const byYear = {};

  assets.forEach(item => {
    if (item.Status !== "Dihapus") {
      const qty = parseInt(item.Jumlah, 10) || 0;
      totalAset += qty;
      totalNilai += (parseFloat(item.HargaPerolehan) || 0) * qty;

      if (item.Kondisi === "Baik") kondisiBaik += qty;
      else if (item.Kondisi === "Rusak Ringan") rusakRingan += qty;
      else if (item.Kondisi === "Rusak Berat") rusakBerat += qty;

      if (byCondition[item.Kondisi] !== undefined) byCondition[item.Kondisi] += qty;

      const kat = item.Kategori || "Lainnya";
      byCategory[kat] = (byCategory[kat] || 0) + qty;

      const lok = item.Lokasi || "Belum Ditentukan";
      byLocation[lok] = (byLocation[lok] || 0) + qty;

      const thn = item.TahunPerolehan ? item.TahunPerolehan.toString() : "Lainnya";
      byYear[thn] = (byYear[thn] || 0) + qty;

      if (thn === currentYear) asetTahunIni += qty;
    }
  });

  return {
    totalAset: totalAset,
    kondisiBaik: kondisiBaik,
    rusakRingan: rusakRingan,
    rusakBerat: rusakBerat,
    totalNilaiAset: totalNilai,
    jumlahKategori: categories.filter(c => c.Status === "Aktif").length,
    jumlahLokasi: locations.filter(l => l.Status === "Aktif").length,
    asetTahunIni: asetTahunIni,
    totalDipinjam: loans.filter(l => l.Status === "Dipinjam").length,
    charts: {
      byCondition: byCondition,
      byCategory: byCategory,
      byLocation: byLocation,
      byYear: byYear
    }
  };
}

function getAllDataSync() {
  return {
    settings: getSettingsData(),
    assets: getAssetsData(),
    categories: getCategoriesData(),
    locations: getLocationsData(),
    mutations: getMutationsData(),
    loans: getLoansData(),
    maintenance: getMaintenanceData(),
    disposals: getDisposalsData(),
    dashboard: getDashboardData(),
    serverTime: getTimestamp()
  };
}

function getAssetsData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.ASET);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    for (let j = 0; j < headers.length; j++) item[headers[j]] = data[i][j] !== undefined ? data[i][j] : "";
    list.push(item);
  }
  return list;
}

function getAssetByIdData(id) {
  return getAssetsData().find(a => a.ID === id) || null;
}

function saveAssetData(asset, userId, userName) {
  if (!asset.NamaBarang || !asset.Kategori || !asset.Lokasi) throw new Error("Nama barang, kategori, dan lokasi wajib diisi.");
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.ASET);
  const data = sheet.getDataRange().getValues();
  const kode = (asset.KodeBarang || "").trim();
  if (kode) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][1].toString().trim().toLowerCase() === kode.toLowerCase() && data[i][15] !== "Dihapus") {
        throw new Error("Kode Barang '" + kode + "' sudah digunakan.");
      }
    }
  }
  const newId = "AST-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMdd") + "-" + Math.floor(1000 + Math.random() * 9000);
  const now = getTimestamp();
  sheet.appendRow([
    newId, kode || ("KD-" + Math.floor(100000 + Math.random() * 900000)),
    asset.NamaBarang, asset.KategoriID || "", asset.Kategori, asset.NUP || "",
    asset.Merk || "", asset.Type || "", asset.Spesifikasi || "",
    asset.TahunPerolehan || new Date().getFullYear(), asset.SumberDana || "BOS",
    Number(asset.HargaPerolehan) || 0, Number(asset.Jumlah) || 1, asset.Satuan || "Unit",
    asset.Kondisi || "Baik", asset.Status || "Aktif", asset.LokasiID || "",
    asset.Lokasi, asset.PenanggungJawab || "", now, userName, now,
    asset.FotoFileID || "", asset.FotoURL || "", asset.Keterangan || "", asset.KIB || ""
  ]);
  addAuditLog(userId, userName, "TAMBAH_ASET", "Aset", newId, "Aset baru: " + asset.NamaBarang);
  return { id: newId };
}

function updateAssetData(asset, userId, userName) {
  if (!asset.ID) throw new Error("ID Aset tidak valid.");
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.ASET);
  const data = sheet.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === asset.ID) { rowIdx = i + 1; break; }
  }
  if (rowIdx === -1) throw new Error("Aset tidak ditemukan.");
  const now = getTimestamp();
  sheet.getRange(rowIdx, 2).setValue(asset.KodeBarang);
  sheet.getRange(rowIdx, 3).setValue(asset.NamaBarang);
  sheet.getRange(rowIdx, 5).setValue(asset.Kategori);
  sheet.getRange(rowIdx, 6).setValue(asset.NUP || "");
  sheet.getRange(rowIdx, 7).setValue(asset.Merk || "");
  sheet.getRange(rowIdx, 8).setValue(asset.Type || "");
  sheet.getRange(rowIdx, 9).setValue(asset.Spesifikasi || "");
  sheet.getRange(rowIdx, 10).setValue(asset.TahunPerolehan);
  sheet.getRange(rowIdx, 11).setValue(asset.SumberDana);
  sheet.getRange(rowIdx, 12).setValue(Number(asset.HargaPerolehan) || 0);
  sheet.getRange(rowIdx, 13).setValue(Number(asset.Jumlah) || 1);
  sheet.getRange(rowIdx, 14).setValue(asset.Satuan || "Unit");
  sheet.getRange(rowIdx, 15).setValue(asset.Kondisi || "Baik");
  sheet.getRange(rowIdx, 16).setValue(asset.Status || "Aktif");
  sheet.getRange(rowIdx, 18).setValue(asset.Lokasi);
  sheet.getRange(rowIdx, 19).setValue(asset.PenanggungJawab || "");
  sheet.getRange(rowIdx, 22).setValue(now);
  if (asset.FotoURL) sheet.getRange(rowIdx, 24).setValue(asset.FotoURL);
  sheet.getRange(rowIdx, 25).setValue(asset.Keterangan || "");
  const kibCol = getHeaderColumn(sheet, "KIB");
  if (kibCol) sheet.getRange(rowIdx, kibCol).setValue(asset.KIB || "");
  addAuditLog(userId, userName, "UBAH_ASET", "Aset", asset.ID, "Perbarui aset: " + asset.NamaBarang);
  return { id: asset.ID };
}

function deleteAssetData(id, userId, userName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.ASET);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 16).setValue("Dihapus");
      sheet.getRange(i + 1, 22).setValue(getTimestamp());
      addAuditLog(userId, userName, "HAPUS_ASET", "Aset", id, "Hapus aset ID: " + id);
      return { id: id };
    }
  }
  throw new Error("Aset tidak ditemukan.");
}


function getHeaderColumn(sheet, headerName) {
  const lastCol = sheet.getLastColumn();
  if (!lastCol) return 0;
  const headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(String);
  const idx = headers.indexOf(headerName);
  return idx >= 0 ? idx + 1 : 0;
}

function getKIBList() {
  return [
    {code:"A", name:"KIB A – Tanah"},
    {code:"B", name:"KIB B – Peralatan dan Mesin"},
    {code:"C", name:"KIB C – Gedung dan Bangunan"},
    {code:"D", name:"KIB D – Jalan, Irigasi dan Jaringan"},
    {code:"E", name:"KIB E – Aset Tetap Lainnya"},
    {code:"F", name:"KIB F – Konstruksi Dalam Pengerjaan"}
  ];
}

function filterAssetData(filters) {
  const f = filters || {};
  return getAssetsData().filter(a => {
    if (a.Status === "Dihapus") return false;
    if (f.kib && f.kib !== "Semua" && String(a.KIB || "") !== String(f.kib)) return false;
    if (f.kategori && f.kategori !== "Semua" && String(a.KategoriID || a.Kategori || "") !== String(f.kategori)) return false;
    if (f.tahun && f.tahun !== "Semua" && String(a.TahunPerolehan || "") !== String(f.tahun)) return false;
    if (f.lokasi && f.lokasi !== "Semua" && String(a.LokasiID || a.Lokasi || "") !== String(f.lokasi)) return false;
    const q = String(f.q || "").trim().toLowerCase();
    if (q && ![a.ID,a.KodeBarang,a.NamaBarang,a.Kategori,a.Lokasi,a.Merk,a.Type,a.KIB].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}

function getKIBData(filters) {
  const rows = filterAssetData(filters);
  const by = {};
  getKIBList().forEach(k => by[k.code] = {code:k.code,name:k.name,items:[],total:0});
  rows.forEach(a => { const k = String(a.KIB || "").trim().toUpperCase(); if (by[k]) { by[k].items.push(a); by[k].total += Number(a.Jumlah)||0; } });
  return by;
}

function getKIRData(filters) {
  const rows = filterAssetData(filters);
  const by = {};
  rows.forEach(a => {
    const key = String(a.Lokasi || "Tanpa Lokasi");
    if (!by[key]) by[key] = {lokasi:key,items:[],total:0};
    by[key].items.push(a); by[key].total += Number(a.Jumlah)||0;
  });
  return by;
}

function normalizeImportValue(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, "yyyy-MM-dd");
  return String(v).trim();
}

function importAssetsData(rows, userId, userName) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Tidak ada data untuk diimport.");
  const ss = getSpreadsheet(), sheet = ss.getSheetByName(SHEETS.ASET);
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);
  const existing = sheet.getDataRange().getValues();
  const kodeSet = new Set(existing.slice(1).filter(r=>String(r[15]||"")!=="Dihapus").map(r=>String(r[1]||"").trim().toLowerCase()).filter(Boolean));
  const aliases = {"Kode Barang":"KodeBarang","Nama Barang":"NamaBarang","Kategori":"Kategori","KIB":"KIB","Merk/Type":"Merk","Merk":"Merk","Type":"Type","Nomor Seri":"NUP","Tahun Perolehan":"TahunPerolehan","Sumber Dana":"SumberDana","Harga/Nilai":"HargaPerolehan","Harga":"HargaPerolehan","Jumlah":"Jumlah","Kondisi":"Kondisi","Ruangan/Lokasi":"Lokasi","Lokasi":"Lokasi","Keterangan":"Keterangan"};
  let valid=0, invalid=0, duplicate=0; const errors=[]; const out=[];
  rows.forEach((raw,idx)=>{
    const a={}; Object.keys(raw||{}).forEach(k=>{ const dest=aliases[k]||k; a[dest]=normalizeImportValue(raw[k]); });
    if (!a.NamaBarang) { invalid++; errors.push({row:idx+2,error:"NamaBarang kosong"}); return; }
    if (a.KIB && !["A","B","C","D","E","F"].includes(a.KIB.toUpperCase())) { invalid++; errors.push({row:idx+2,error:"KIB harus A-F"}); return; }
    const kode=String(a.KodeBarang||"").trim().toLowerCase();
    if(kode && kodeSet.has(kode)){ duplicate++; errors.push({row:idx+2,error:"Kode Barang sudah ada"}); return; }
    const id="AST-"+Utilities.formatDate(new Date(),CONFIG.TIMEZONE,"yyyyMMddHHmmss")+"-"+Math.floor(1000+Math.random()*9000);
    const row=headers.map(h=>{ if(h==="ID") return id; if(h==="KategoriID") return ""; if(h==="Kategori") return a.Kategori||""; if(h==="LokasiID") return ""; if(h==="Lokasi") return a.Lokasi||""; if(h==="Status") return "Aktif"; if(h==="TanggalInput") return getTimestamp(); if(h==="InputBy") return userName; if(h==="UpdatedAt") return getTimestamp(); if(h==="FotoFileID"||h==="FotoURL") return ""; if(h==="KIB") return a.KIB||""; if(h==="KodeBarang") return a.KodeBarang||("KD-"+Math.floor(100000+Math.random()*900000)); if(h==="Jumlah") return Number(a.Jumlah)||1; if(h==="HargaPerolehan") return Number(String(a.HargaPerolehan||0).replace(/[^0-9.-]/g,""))||0; if(h==="Kondisi") return a.Kondisi||"Baik"; if(h==="Satuan") return a.Satuan||"Unit"; if(h==="TahunPerolehan") return a.TahunPerolehan||new Date().getFullYear(); return a[h]||""; });
    out.push(row); valid++; if(kode) kodeSet.add(kode);
  });
  if(out.length) sheet.getRange(sheet.getLastRow()+1,1,out.length,headers.length).setValues(out);
  addAuditLog(userId,userName,"IMPORT_ASET","Aset","IMPORT",`Import aset: ${valid} valid, ${invalid} invalid, ${duplicate} duplikat.`);
  return {valid,invalid,duplicate,errors,imported:out.length};
}

function getImportTemplateData() {
  return ["Kode Barang","Nama Barang","Kategori","KIB","Merk/Type","Nomor Seri","Tahun Perolehan","Sumber Dana","Harga/Nilai","Jumlah","Kondisi","Ruangan/Lokasi","Keterangan"];
}

function getCategoriesData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.KATEGORI);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    for (let j = 0; j < headers.length; j++) item[headers[j]] = data[i][j];
    list.push(item);
  }
  return list;
}

function saveCategoryData(cat, userId, userName) {
  if (!cat.NamaKategori) throw new Error("Nama kategori wajib diisi.");
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.KATEGORI);
  const newId = "KAT-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMdd") + "-" + Math.floor(100 + Math.random() * 900);
  const now = getTimestamp();
  sheet.appendRow([newId, cat.KodeKategori || ("K-" + Math.floor(10 + Math.random() * 90)), cat.NamaKategori, cat.Keterangan || "", "Aktif", now, now]);
  addAuditLog(userId, userName, "TAMBAH_KATEGORI", "Kategori", newId, "Kategori: " + cat.NamaKategori);
  return { id: newId };
}

function getLocationsData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.LOKASI);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    for (let j = 0; j < headers.length; j++) item[headers[j]] = data[i][j];
    list.push(item);
  }
  return list;
}

function saveLocationData(lok, userId, userName) {
  if (!lok.NamaLokasi) throw new Error("Nama lokasi wajib diisi.");
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.LOKASI);
  const newId = "LOK-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMdd") + "-" + Math.floor(100 + Math.random() * 900);
  sheet.appendRow([newId, lok.KodeLokasi || ("L-" + Math.floor(10 + Math.random() * 90)), lok.NamaLokasi, lok.Gedung || "", lok.Lantai || "", lok.PenanggungJawab || "", "Aktif", lok.Keterangan || ""]);
  addAuditLog(userId, userName, "TAMBAH_LOKASI", "Lokasi", newId, "Lokasi: " + lok.NamaLokasi);
  return { id: newId };
}

function saveMutationData(mut, userId, userName) {
  if (!mut.AsetID || !mut.LokasiTujuan) throw new Error("Aset dan Lokasi Tujuan wajib ditentukan.");
  const ss = getSpreadsheet();
  const mutSheet = ss.getSheetByName(SHEETS.MUTASI);
  const asetSheet = ss.getSheetByName(SHEETS.ASET);
  const mutId = "MUT-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMddHHmmss");
  const now = getTimestamp();
  mutSheet.appendRow([mutId, mut.AsetID, mut.Tanggal || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd"), mut.LokasiAsal || "", mut.LokasiTujuan, mut.PenanggungJawabLama || "", mut.PenanggungJawabBaru || "", mut.Alasan || "", userName, now]);
  
  const asetData = asetSheet.getDataRange().getValues();
  for (let i = 1; i < asetData.length; i++) {
    if (asetData[i][0] === mut.AsetID) {
      asetSheet.getRange(i + 1, 18).setValue(mut.LokasiTujuan);
      if (mut.PenanggungJawabBaru) asetSheet.getRange(i + 1, 19).setValue(mut.PenanggungJawabBaru);
      asetSheet.getRange(i + 1, 22).setValue(now);
      break;
    }
  }
  addAuditLog(userId, userName, "MUTASI_ASET", "Mutasi", mutId, "Pindah aset " + mut.AsetID + " ke " + mut.LokasiTujuan);
  return { id: mutId };
}

function getMutationsData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.MUTASI);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    for (let j = 0; j < headers.length; j++) item[headers[j]] = data[i][j];
    list.push(item);
  }
  return list;
}

function saveLoanData(loan, userId, userName) {
  if (!loan.AsetID || !loan.Peminjam) throw new Error("Aset dan Peminjam wajib diisi.");
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PEMINJAMAN);
  const loanId = "PINJAM-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMddHHmmss");
  const now = getTimestamp();
  sheet.appendRow([loanId, loan.AsetID, loan.TanggalPinjam || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd"), loan.TanggalKembali || "", loan.Peminjam, loan.Keperluan || "", Number(loan.Jumlah) || 1, "Dipinjam", userName, now]);
  
  const asetSheet = ss.getSheetByName(SHEETS.ASET);
  const asetData = asetSheet.getDataRange().getValues();
  for (let i = 1; i < asetData.length; i++) {
    if (asetData[i][0] === loan.AsetID) {
      asetSheet.getRange(i + 1, 16).setValue("Dipinjam");
      asetSheet.getRange(i + 1, 22).setValue(now);
      break;
    }
  }
  addAuditLog(userId, userName, "PINJAM_ASET", "Peminjaman", loanId, "Pinjam aset " + loan.AsetID + " oleh " + loan.Peminjam);
  return { id: loanId };
}

function returnLoanData(loanId, returnDate, userId, userName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PEMINJAMAN);
  const data = sheet.getDataRange().getValues();
  let targetAsetId = "";
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === loanId) {
      sheet.getRange(i + 1, 4).setValue(returnDate || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd"));
      sheet.getRange(i + 1, 8).setValue("Dikembalikan");
      targetAsetId = data[i][1];
      break;
    }
  }
  if (targetAsetId) {
    const asetSheet = ss.getSheetByName(SHEETS.ASET);
    const asetData = asetSheet.getDataRange().getValues();
    for (let j = 1; j < asetData.length; j++) {
      if (asetData[j][0] === targetAsetId) {
        asetSheet.getRange(j + 1, 16).setValue("Aktif");
        asetSheet.getRange(j + 1, 22).setValue(getTimestamp());
        break;
      }
    }
  }
  addAuditLog(userId, userName, "KEMBALI_ASET", "Peminjaman", loanId, "Kembali aset " + targetAsetId);
  return { id: loanId };
}

function getLoansData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PEMINJAMAN);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    for (let j = 0; j < headers.length; j++) item[headers[j]] = data[i][j];
    list.push(item);
  }
  return list;
}

function saveMaintenanceData(mnt, userId, userName) {
  if (!mnt.AsetID || !mnt.JenisPerbaikan) throw new Error("Aset dan Jenis Perbaikan wajib diisi.");
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PEMELIHARAAN);
  const mntId = "RAWAT-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMddHHmmss");
  sheet.appendRow([mntId, mnt.AsetID, mnt.Tanggal || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd"), mnt.JenisPerbaikan, mnt.Deskripsi || "", Number(mnt.Biaya) || 0, mnt.Vendor || "", mnt.Status || "Diajukan", mnt.TanggalSelesai || "", userName, mnt.Keterangan || ""]);
  addAuditLog(userId, userName, "PEMELIHARAAN_ASET", "Pemeliharaan", mntId, "Pemeliharaan aset " + mnt.AsetID);
  return { id: mntId };
}

function getMaintenanceData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PEMELIHARAAN);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    for (let j = 0; j < headers.length; j++) item[headers[j]] = data[i][j];
    list.push(item);
  }
  return list;
}

function saveDisposalData(dsp, userId, userName) {
  if (!dsp.AsetID || !dsp.Alasan) throw new Error("Aset dan Alasan wajib diisi.");
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PENGHAPUSAN);
  const dspId = "HAPUS-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMddHHmmss");
  sheet.appendRow([dspId, dsp.AsetID, dsp.Tanggal || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd"), dsp.Alasan, dsp.Kondisi || "Rusak Berat", Number(dsp.Nilai) || 0, dsp.DokumenPendukung || "", dsp.Status || "Diusulkan", userName]);
  if (dsp.Status === "Disetujui" || dsp.Status === "Dihapus") {
    const asetSheet = ss.getSheetByName(SHEETS.ASET);
    const asetData = asetSheet.getDataRange().getValues();
    for (let i = 1; i < asetData.length; i++) {
      if (asetData[i][0] === dsp.AsetID) {
        asetSheet.getRange(i + 1, 16).setValue("Dihapus");
        asetSheet.getRange(i + 1, 22).setValue(getTimestamp());
        break;
      }
    }
  }
  addAuditLog(userId, userName, "PENGHAPUSAN_ASET", "Penghapusan", dspId, "Penghapusan aset: " + dsp.AsetID);
  return { id: dspId };
}

function getDisposalsData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PENGHAPUSAN);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    for (let j = 0; j < headers.length; j++) item[headers[j]] = data[i][j];
    list.push(item);
  }
  return list;
}

function handleFileUpload(fileName, base64Data, folderType, userId, userName) {
  let rootFolder;
  if (CONFIG.ROOT_FOLDER_ID) {
    try { rootFolder = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID); } catch(e) {}
  }
  if (!rootFolder) {
    const existing = DriveApp.getFoldersByName(CONFIG.APP_NAME);
    rootFolder = existing.hasNext() ? existing.next() : DriveApp.createFolder(CONFIG.APP_NAME);
  }
  const targetSubFolderName = folderType === "Logo" ? "Logo" : "Foto Aset";
  const subFolders = rootFolder.getFoldersByName(targetSubFolderName);
  const targetFolder = subFolders.hasNext() ? subFolders.next() : rootFolder.createFolder(targetSubFolderName);
  const cleanBase64 = base64Data.replace(/^data:[a-zA-Z0-9\/\+]+;base64,/, '');
  const decodedBytes = Utilities.base64Decode(cleanBase64);
  const blob = Utilities.newBlob(decodedBytes, "image/jpeg", fileName);
  const file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileId = file.getId();
  const fileUrl = "https://lh3.googleusercontent.com/d/" + fileId;
  addAuditLog(userId, userName, "UPLOAD_FILE", "GoogleDrive", fileId, "Upload: " + fileName);
  return { fileId: fileId, fileName: fileName, fileUrl: fileUrl, folderId: targetFolder.getId() };
}

function getSettingsData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < data.length; i++) settings[data[i][0]] = data[i][1];
  return settings;
}

function saveSettingsData(settingsObj, userId, userName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SETTINGS);
  for (let key in settingsObj) updateSettingValue(sheet, key, settingsObj[key]);
  addAuditLog(userId, userName, "UBAH_PENGATURAN", "Settings", "Settings", "Update pengaturan sekolah");
  return getSettingsData();
}

function updateSettingValue(sheet, key, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      sheet.getRange(i + 1, 3).setValue(getTimestamp());
      return;
    }
  }
  sheet.appendRow([key, value, getTimestamp()]);
}

function addAuditLog(userId, userName, action, module, recordId, description) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.AUDIT);
    if (!sheet) return;
    const logId = "LOG-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMddHHmmss") + "-" + Math.floor(100 + Math.random() * 900);
    sheet.appendRow([logId, getTimestamp(), userId || "system", userName || "System", action, module, recordId || "", description || ""]);
  } catch(e) {}
}

function getAuditLogsData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.AUDIT);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const list = [];
  const start = Math.max(1, data.length - 200);
  for (let i = data.length - 1; i >= start; i--) {
    const item = {};
    for (let j = 0; j < headers.length; j++) item[headers[j]] = data[i][j];
    list.push(item);
  }
  return list;
}

function getUsersData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.USERS);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    list.push({ id: data[i][0], username: data[i][1], nama: data[i][3], role: data[i][4], status: data[i][5], createdAt: data[i][6], lastLogin: data[i][7] });
  }
  return list;
}

function saveUserData(user, userId, userName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toLowerCase() === user.username.trim().toLowerCase()) throw new Error("Username sudah terdaftar.");
  }
  const newId = "USR-" + Math.floor(100 + Math.random() * 900);
  const now = getTimestamp();
  sheet.appendRow([newId, user.username.trim(), hashPassword(user.password || "123456"), user.nama, user.role, "Aktif", now, ""]);
  addAuditLog(userId, userName, "TAMBAH_PENGGUNA", "Users", newId, "User: " + user.nama);
  return { id: newId };
}

function setUserStatusData(targetUserId, newStatus, userId, userName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === targetUserId) {
      sheet.getRange(i + 1, 6).setValue(newStatus);
      addAuditLog(userId, userName, "UBAH_STATUS_USER", "Users", targetUserId, "Status user ke " + newStatus);
      return { id: targetUserId, status: newStatus };
    }
  }
  throw new Error("Pengguna tidak ditemukan.");
}

function backupDatabaseToDrive(userId, userName) {
  const ss = getSpreadsheet();
  const file = DriveApp.getFileById(ss.getId());
  let backupFolder;
  if (CONFIG.ROOT_FOLDER_ID) {
    try {
      const root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
      const sub = root.getFoldersByName("Backup");
      if (sub.hasNext()) backupFolder = sub.next();
    } catch(e) {}
  }
  if (!backupFolder) {
    const existing = DriveApp.getFoldersByName("Backup");
    backupFolder = existing.hasNext() ? existing.next() : DriveApp.createFolder("Backup");
  }
  const backupName = "BACKUP_SAPRAS_SMAN1_SEUNUDDON_" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMdd_HHmmss");
  const backupFile = file.makeCopy(backupName, backupFolder);
  addAuditLog(userId, userName, "BACKUP_DATABASE", "Backup", backupFile.getId(), "Backup Spreadsheet ke Drive.");
  return { backupFileId: backupFile.getId(), backupFileName: backupName, url: backupFile.getUrl(), timestamp: getTimestamp() };
}
