import { getHomeData } from "@/lib/data";
import { JournalHome } from "@/lab/journal/JournalHome";

export const revalidate = 300;

export default async function Page() {
  const data = await getHomeData({ allowFixtures: true });
  return <JournalHome data={data} />;
}
