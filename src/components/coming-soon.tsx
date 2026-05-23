import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  title: string;
  description: string;
  icon: LucideIcon;
  ideas: string;
  eyebrow?: string;
};

export function ComingSoon({ title, description, icon: Icon, ideas, eyebrow = "Em desenvolvimento" }: Props) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <Card className="border-dashed bg-gradient-brand-subtle">
        <CardHeader className="text-center py-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-6" />
          </div>
          <CardTitle className="mt-4">Reservado no roadmap</CardTitle>
          <CardDescription className="max-w-md mx-auto">
            Será desenvolvido depois que o módulo financeiro estiver maduro.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-md mx-auto text-center text-sm text-muted-foreground pb-8">
          {ideas}
        </CardContent>
      </Card>
    </div>
  );
}
