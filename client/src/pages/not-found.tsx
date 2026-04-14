import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
      <p className="text-muted-foreground">페이지를 찾을 수 없습니다.</p>
      <Link href="/">
        <a><Button variant="outline" size="sm">처음으로</Button></a>
      </Link>
    </div>
  );
}
