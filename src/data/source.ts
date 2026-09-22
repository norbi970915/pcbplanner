/** A reference that a data table was taken from or verified against. */
export interface DataSource {
  title: string;
  url: string;
  /** What was taken from / checked against this source, revision, caveats. */
  note: string;
}
