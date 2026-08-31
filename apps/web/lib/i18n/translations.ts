export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];

const dict = {
  // common
  loading: { ko: "불러오는 중...", en: "Loading..." },
  save: { ko: "저장", en: "Save" },
  saving: { ko: "저장 중...", en: "Saving..." },
  delete: { ko: "삭제", en: "Delete" },
  remove: { ko: "제거", en: "Remove" },
  statusLabel: { ko: "현재 상태:", en: "Status:" },
  statusSet: { ko: "설정됨", en: "Set" },
  statusUnset: { ko: "미설정", en: "Not set" },
  processingLabel: { ko: "처리 중...", en: "Processing..." },

  // app
  appName: { ko: "kibble", en: "kibble" },

  // bottom nav
  navHome: { ko: "홈", en: "Home" },
  settingsLabel: { ko: "설정", en: "Settings" },

  // login
  loginIntro: { ko: "로그인해서 일지를 기록하세요.", en: "Log in to start your pet diary." },
  bootstrapIntro: { ko: "첫 관리자 계정을 만들어 시작하세요.", en: "Create the first admin account to get started." },
  namePlaceholder: { ko: "이름", en: "Name" },
  emailPlaceholder: { ko: "이메일", en: "Email" },
  passwordPlaceholder: { ko: "비밀번호", en: "Password" },
  passwordMinPlaceholder: { ko: "비밀번호 (8자 이상)", en: "Password (8+ characters)" },
  confirmPasswordPlaceholder: { ko: "비밀번호 확인", en: "Confirm password" },
  createFirstAdmin: { ko: "첫 관리자 만들기", en: "Create first admin" },
  loginButton: { ko: "로그인", en: "Log in" },
  loggingIn: { ko: "로그인 중...", en: "Logging in..." },
  creatingAccount: { ko: "생성 중...", en: "Creating..." },
  loginError: { ko: "로그인에 실패했습니다. 이메일/비밀번호를 확인하세요.", en: "Login failed. Check your email/password." },
  connectionError: { ko: "서버에 연결할 수 없습니다.", en: "Could not connect to the server." },
  passwordMismatch: { ko: "비밀번호가 일치하지 않습니다.", en: "Passwords don't match." },
  adminExistsError: { ko: "이미 관리자 계정이 있습니다. 로그인해주세요.", en: "An admin account already exists. Please log in." },
  accountCreateError: { ko: "계정 생성에 실패했습니다.", en: "Failed to create account." },

  // settings
  myAccountTitle: { ko: "내 계정", en: "My account" },
  roleAdmin: { ko: "관리자", en: "Admin" },
  roleGeneral: { ko: "일반", en: "Member" },
  logoutButton: { ko: "로그아웃", en: "Log out" },
  logoutAllButton: { ko: "모든 기기에서 로그아웃", en: "Log out everywhere" },
  confirmLogoutAll: {
    ko: "모든 기기에서 로그아웃합니다. 다른 기기에서도 다시 로그인해야 합니다.",
    en: "Log out on all devices. You will need to sign in again everywhere.",
  },
  changePasswordTitle: { ko: "비밀번호 변경", en: "Change password" },
  currentPasswordPlaceholder: { ko: "현재 비밀번호", en: "Current password" },
  newPasswordPlaceholder: { ko: "새 비밀번호", en: "New password" },
  confirmNewPasswordPlaceholder: { ko: "새 비밀번호 확인", en: "Confirm new password" },
  changePasswordButton: { ko: "비밀번호 변경", en: "Change password" },
  passwordMismatchError: { ko: "새 비밀번호가 일치하지 않습니다.", en: "New passwords don't match." },
  passwordChangedReLoginToast: { ko: "비밀번호가 변경되었습니다. 다시 로그인하세요.", en: "Password changed. Please sign in again." },
  passwordChangeFailToast: { ko: "비밀번호 변경 실패: {msg}", en: "Password change failed: {msg}" },
  screenTitle: { ko: "화면", en: "Display" },
  themeLabel: { ko: "테마", en: "Theme" },
  themeLight: { ko: "라이트", en: "Light" },
  themeDark: { ko: "다크", en: "Dark" },
  themeSystem: { ko: "시스템", en: "System" },
  languageLabel: { ko: "언어", en: "Language" },
  backupRestoreTitle: { ko: "백업 / 복원", en: "Backup / restore" },
  backupRestoreHint: {
    ko: "사용자·설정·업로드 파일을 tar.gz로 보냅니다.",
    en: "Export users, settings, and uploaded files as tar.gz.",
  },
  backupSecurityHint: {
    ko: "백업에는 비밀번호 해시가 포함됩니다. 안전한 곳에 보관하세요.",
    en: "Backups contain password hashes. Store them securely.",
  },
  exportButton: { ko: "백업 보내기", en: "Export backup" },
  exportingLabel: { ko: "보내는 중...", en: "Exporting..." },
  restoreLabel: { ko: "백업 복원", en: "Restore backup" },
  confirmRestore: {
    ko: "현재 데이터를 백업 파일로 덮어씁니다. 계속할까요?",
    en: "This will overwrite current data with the backup. Continue?",
  },
  restoreFailFallback: { ko: "복원에 실패했습니다.", en: "Restore failed." },
  restoreSuccessToast: { ko: "복원이 완료되었습니다.", en: "Restore completed." },
  restoreRecoveryTitle: { ko: "임시 비밀번호", en: "Temporary passwords" },
  restoreRecoveryHint: {
    ko: "아래 비밀번호는 이번에만 표시됩니다. 저장한 뒤 닫으세요.",
    en: "These passwords are shown once. Save them before closing.",
  },

  // users (admin)
  usersTitle: { ko: "가족 계정", en: "Family accounts" },
  createAccountButton: { ko: "계정 만들기", en: "Create account" },
  accountCreatedToast: { ko: "계정이 생성되었습니다.", en: "Account created." },
  confirmDeleteAccount: { ko: "이 계정을 삭제할까요?", en: "Delete this account?" },
  confirmResetPassword: {
    ko: "{name}의 비밀번호를 재설정할까요?",
    en: "Reset password for {name}?",
  },
  resetPasswordButton: { ko: "비밀번호 재설정", en: "Reset password" },
  resetPasswordTitle: { ko: "임시 비밀번호", en: "Temporary password" },
  resetPasswordHint: {
    ko: "아래 값은 이번에만 표시됩니다. 사용자에게 전달하세요.",
    en: "Shown once. Share it with the user.",
  },

  // offline
  offlineTitle: { ko: "오프라인", en: "Offline" },
  offlineBody: {
    ko: "네트워크에 연결되지 않았습니다. 연결되면 자동으로 다시 시도합니다.",
    en: "You are offline. We will retry when you are back online.",
  },
  offlineBannerText: { ko: "오프라인 — 일부 기능이 제한됩니다", en: "Offline — some features are limited" },

  // one-time secrets
  oneTimeSecretCopiedToast: { ko: "복사했습니다.", en: "Copied." },
  oneTimeSecretCopyFallbackToast: { ko: "수동으로 복사하세요.", en: "Copy manually." },
  oneTimeSecretDownloadedToast: { ko: "파일을 저장했습니다.", en: "File saved." },
  oneTimeSecretSelectHint: { ko: "텍스트를 선택해 복사할 수 있습니다.", en: "Select text to copy." },
  oneTimeSecretCopyButton: { ko: "복사", en: "Copy" },
  oneTimeSecretCopyAllButton: { ko: "전체 복사", en: "Copy all" },
  oneTimeSecretDownloadButton: { ko: "파일로 저장", en: "Save as file" },
  oneTimeSecretSavedCheckbox: { ko: "안전한 곳에 저장했습니다", en: "I saved these securely" },
  oneTimeSecretCloseButton: { ko: "닫기", en: "Close" },

  // event types (docs/seed-event-types.md §3)
  "eventType.meal": { ko: "사료", en: "Meal" },
  "eventType.water": { ko: "물", en: "Water" },
  "eventType.treat": { ko: "간식", en: "Treat" },
  "eventType.poop": { ko: "대변", en: "Stool" },
  "eventType.pee": { ko: "소변", en: "Urine" },
  "eventType.vomit": { ko: "구토", en: "Vomit" },
  "eventType.medication": { ko: "투약", en: "Medication" },
  "eventType.weight": { ko: "체중", en: "Weight" },
  "eventType.symptom": { ko: "증상", en: "Symptom" },
  "eventType.play": { ko: "놀이", en: "Play" },
  "eventType.grooming": { ko: "그루밍", en: "Grooming" },
  "eventType.walk": { ko: "산책", en: "Walk" },
  "eventType.litter_change": { ko: "모래갈이", en: "Litter change" },
  "eventType.vet_visit": { ko: "병원", en: "Vet visit" },
  "eventType.vaccination": { ko: "접종", en: "Vaccination" },
  "eventType.note": { ko: "메모", en: "Note" },
} as const;

export const translations = dict;

export type TranslationKey = keyof typeof dict;

export function translate(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const entry = dict[key];
  const template = entry[locale] ?? entry.ko;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, k) => (k in params ? String(params[k]) : match));
}
