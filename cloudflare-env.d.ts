declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    /** Vergul bilan ajratilgan admin email'lari. */
    ADMIN_EMAILS?: string;
  }
}
