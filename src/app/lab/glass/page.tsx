import { getHomeData } from "@/lib/data";
import { GlassHome } from "@/lab/glass/GlassHome";

export const revalidate = 300;

export default async function Page() {
  const data = await getHomeData({ allowFixtures: true });
  return <GlassHome data={data} />;
}
