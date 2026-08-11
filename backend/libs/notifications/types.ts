/**
 * A broadcast of a single shared, anonymous survey link to a whole team
 * channel. No recipient identity is included or persisted.
 */
export interface SurveyLinkBroadcast {
  url: string;
  projectNames: string[];
  deadline: Date;
}
