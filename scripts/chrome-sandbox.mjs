export function chromeSandboxArgs({ platform = process.platform, uid = process.getuid?.(), override = process.env.ANATOMY_NO_SANDBOX } = {}) {
  return platform === "linux" && (uid === 0 || override === "1") ? ["--no-sandbox"] : [];
}
