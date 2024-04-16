import { Eye, MoveUpRight } from "lucide-react";
import Link from "next/link";

export default function Article({
  title,
  description,
  views,
  id,
}: {
  title: string;
  description: string;
  views: number;
  id: number;
}) {
  return (
    <div className="w-full bg-white dark:bg-black rounded-xl shadow-md p-4 border border-[#eaeaea] dark:border-neutral-600">
      <Link href={`/post/${id}`}>
        <h1 className="text-primary font-bold text-2xl flex items-center gap-1 cursor-pointer transition-all hover:scale-[101%]">
          {title + " "} <MoveUpRight className="font-normal w-8" />
        </h1>
      </Link>
      <p className="text-primary text-xl mb-4">{description}</p>
      <p className="text-lg flex items-center gap-1">
        <Eye className="w-5" /> {views} views
      </p>
    </div>
  );
}
