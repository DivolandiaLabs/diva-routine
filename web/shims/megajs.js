// MEGA no está disponible en la versión web.
const off = () => {
  throw new Error('MEGA no está disponible en la versión web');
};
export class Storage {
  constructor() { off(); }
}
export class File {
  constructor() { off(); }
  static fromURL() { off(); }
}
export default { Storage, File };
