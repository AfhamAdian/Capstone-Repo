export interface SurveyLinkNotification {
  recipientEmail: string;
  recipientName?: string;
  /** Discord user ID (snowflake), if the recipient has linked their account - see User.discord_user_id. Null/undefined means the Discord DM channel is skipped for them. */
  recipientDiscordUserId?: string | null;
  url: string;
  projectNames: string[];
  deadline: Date;
}

/**
 * A broadcast of a single shared, anonymous survey link to a whole team
 * channel (Telegram group / Discord channel) rather than an individual.
 * Used only in shared-link mode, where one link serves the whole cohort.
 */
export interface SurveyLinkBroadcast {
  url: string;
  projectNames: string[];
  deadline: Date;
}
