export function parseJson (input: string): any | null {
  try {
    const result = JSON.parse(input);
    return result;
  } catch (e) {
    console.error("Error parsing JSON: ", e.message);
    return null;
  }
}