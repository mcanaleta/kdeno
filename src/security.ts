export function generatePassword(length: number): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomByte = new Uint8Array(1);
    crypto.getRandomValues(randomByte);
    password += charset.charAt(randomByte[0] % charset.length);
  }
  return password;
}
