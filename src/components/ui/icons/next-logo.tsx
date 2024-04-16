import Image from "next/image";

export default function NextIcon({ className }: { className: string }) {
  return (
    <Image
      src={"/next-logo.svg"}
      className={className}
      alt="Next.js Logo"
      width={64}
      height={64}
    />
  );
}

export function NextHeader() {
  return (
    <div className="flex justify-center items-center">
      <Image
        className="w-10/12"
        src={"/next-logo.svg"}
        alt="Next.js Logo"
        width={120}
        height={120}
      />
    </div>
  );
}
