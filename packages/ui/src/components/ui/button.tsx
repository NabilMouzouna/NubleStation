import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-tight transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-brand-blue to-brand-violet text-white shadow-sm hover:opacity-90 hover:shadow-md",
        ink: "bg-foreground text-white hover:bg-foreground/90 hover:shadow-md",
        secondary:
          "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-white",
        ghost:
          "border-2 border-foreground/10 bg-transparent text-foreground hover:bg-foreground/5",
        destructive:
          "bg-destructive text-white shadow-sm hover:opacity-90 hover:shadow-md",
      },
      size: {
        default: "h-11 px-7 py-3",
        sm: "h-9 px-5 py-2 text-xs",
        lg: "h-12 px-8 py-4 text-base",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
