export interface GithubRepo {
  name: string;
  description: string;
  url: string;
  language: string;
  stars: number;
  forks: number;
}

const GITHUB_REPOS_URL =
  'https://api.github.com/users/cempack/repos?sort=updated&per_page=12&type=owner';

export async function fetchGithubRepos(): Promise<GithubRepo[]> {
  const token = import.meta.env.GITHUB_TOKEN;

  if (!token) {
    return [];
  }

  try {
    const res = await fetch(GITHUB_REPOS_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'elliotmoreau.fr',
      },
    });

    if (!res.ok) {
      return [];
    }

    const allRepos = await res.json();

    return allRepos
      .filter((repo: any) => !repo.fork)
      .slice(0, 6)
      .map((repo: any) => ({
        name: repo.name,
        description: repo.description || '',
        url: repo.html_url,
        language: repo.language || '',
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
      }));
  } catch {
    return [];
  }
}
