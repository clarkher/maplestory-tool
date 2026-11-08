import { RouteHome } from "@/components/route/RouteHome";
import { staticArticleEntries } from "@/lib/static-data";

export default function HomePage() {
  return <RouteHome articles={staticArticleEntries()} />;
}
