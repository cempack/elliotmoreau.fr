export async function fetchGithub(element: string): Promise<string> {
  return fetch("https://api.github.com/users/cempack")
    .then((response) => response.json())
    .then((data) => {
      return data[element];
    })
    .catch((error) => {
      console.error("Error fetching GitHub data:", error);
      return "Error fetching GitHub data.";
    });
}
