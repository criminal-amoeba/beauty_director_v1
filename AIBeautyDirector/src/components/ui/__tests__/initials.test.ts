import { initials } from '../Avatar';

it.each([
  ['Mei Lin', 'ML'],
  ['alex', 'A'],
  ['  Ana  María  López ', 'AM'],
  ['林美', '林'],
  ['', ''],
])('initials(%j) = %j', (name, expected) => {
  expect(initials(name)).toBe(expected);
});
