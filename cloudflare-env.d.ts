declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    /** Comma-separated sign-in emails allowed to open /admin. */
    ADMIN_EMAILS?: string;
  }
}
