import { Badge } from "@/app/page";
import { fetchGithub } from "@/lib/fetch-github";
import Image from "next/image";
import Social from "./social";

async function getYTFollowers(): Promise<string> {
  const API_KEY = process.env.YT_API_KEY;
  const ChannelID = "UCc9Io6fXSAsYf2QLaT7BW7Q";

  return new Promise((resolve, reject) => {
    fetch(
      `https://youtube.googleapis.com/youtube/v3/channels?part=statistics&id=${ChannelID}&key=${API_KEY}`,
    )
      .then((response) => response.json())
      .then((data) => {
        resolve(data.items[0].statistics.subscriberCount);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

export default function Footer() {
  return (
    <footer className="mt-16 px-4 md:px-0">
      <h1 id="contact" className="text-2xl font-bold">
        Contact me
      </h1>
      <p className="mb-6 text-lg w-full md:w-5/6 items-center">
        Contact me by{" "}
        <Badge href="mailto:contact@elliotmoreau.fr">
          <Image
            alt="Email icon"
            src="/email.svg"
            className="!mr-1 invert-0 dark:invert"
            width="14"
            height="14"
          />
          Email
        </Badge>{" "}
        or on my social networks
      </p>
      <div className="flex flex-row gap-2">
        <Social
          name="X Icon"
          href="https://twitter.com/cempack_"
          icon="x.svg"
        />
        <Social
          name="Github Icon"
          href="https://github.com/cempack"
          icon="github.svg"
          followers={fetchGithub("followers")}
        />
        <Social
          name="YouTube Icon"
          href="https://youtube.com/@cempack"
          icon="youtube.svg"
          followers={getYTFollowers()}
        />
        <Social
          name="Instagram Icon"
          href="https://instagram.com/elliot.moreau.19/"
          icon="instagram.svg"
        />
      </div>
    </footer>
  );
}
