import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM массажного салона",
    short_name: "Massage CRM",
    description: "Записи, клиенты, абонементы и финансы массажного салона",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#08776d",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
