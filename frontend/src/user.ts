const USER_ID_KEY = 'sutra_user_id';

export function getUserId(): string {
  const existing = window.localStorage.getItem(
    USER_ID_KEY,
  );

  if (existing) {
    return existing;
  }

  const userId = `demo-${crypto.randomUUID()}`;
  window.localStorage.setItem(USER_ID_KEY, userId);
  return userId;
}
