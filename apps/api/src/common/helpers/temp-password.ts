import { randomInt } from 'node:crypto';

export function generateTemporaryPassword(): string {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghjkmnpqrstuvwxyz', '23456789', '!@#$%^&*?'];
  const all = groups.join('');
  const password = groups.map((group) => group[randomInt(group.length)]!);
  for (let index = 0; index < 8; index++) password.push(all[randomInt(all.length)]!);
  for (let index = password.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [password[index], password[swap]] = [password[swap]!, password[index]!];
  }
  return password.join('');
}
