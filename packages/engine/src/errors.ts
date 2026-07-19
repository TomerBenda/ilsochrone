/** Origin is outside the covered region or too far from any walkable edge. */
export class OutOfCoverageError extends Error {
  constructor(message = 'Origin is outside the covered area.') {
    super(message);
    this.name = 'OutOfCoverageError';
  }
}

/** The graph asset bytes are unreadable or of an unsupported version. */
export class AssetFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetFormatError';
  }
}
