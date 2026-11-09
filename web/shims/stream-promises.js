// node:stream/promises: pipeline(origen, destino).
export async function pipeline(src, dest) {
  for await (const c of src) dest.write(c);
  await new Promise((resolve, reject) => {
    dest.on?.('error', reject);
    dest.end(() => resolve());
  });
}
export default { pipeline };
