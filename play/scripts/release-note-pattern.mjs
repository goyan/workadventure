// The commit subjects published in « Nouveautés ». The user-facing scopes: the front, and the map tool ("carte"),
// which is part of it. Shared by the generator and by the pull request check, so that they cannot drift apart.
export const PUBLISHED = /^(feat|fix)\((?:front|carte)\): (.+)$/;
