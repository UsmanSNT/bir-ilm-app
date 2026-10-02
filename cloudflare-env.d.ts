declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_BOT_USERNAME?: string;
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
    CALLS_APP_ID?: string;
    CALLS_APP_TOKEN?: string;
    TURN_KEY_ID?: string;
    TURN_KEY_TOKEN?: string;
    TALK_ADMINS?: string;
  }
}
