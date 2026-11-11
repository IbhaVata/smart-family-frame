/** Invite links look like https://<family-app>/join?invite=<token>. */
export function readInviteFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('invite');
}

export function inviteLink(token: string): string {
  return `${window.location.origin}/join?invite=${encodeURIComponent(token)}`;
}

export function inviteMessage(familyName: string, link: string): string {
  return `Join ${familyName} on our Smart Family Frame, so you can send photos to our TV: ${link}`;
}
