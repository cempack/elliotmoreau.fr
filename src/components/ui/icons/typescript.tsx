import Image from "next/image";

export default function TsIcon({ className }: { className: string }) {
  return (
    <Image
      src={"/typescript-logo.svg"}
      className={className}
      alt="Typescript Logo"
      width={64}
      height={64}
    />
  );
}

export function TsHeader() {
  return (
    <div className="flex justify-center items-center">
      <Image
        className="w-10/12"
        src={"/typescript-logo.svg"}
        alt="Typescript Logo"
        width={120}
        height={120}
      />
    </div>
  );
}
