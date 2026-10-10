import { getHomeData } from "@/lib/data";
import { RiceHome } from "@/lab/rice/RiceHome";

export const revalidate = 300;

export default async function Page() {
  const data = await getHomeData({ allowFixtures: true });
  return <RiceHome data={data} />;
}
