import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";

const Home = () => {
  redirect("/authentication");
  return (
    <div>
      <Button>Bootcamp</Button>
    </div>
  );
};

export default Home;
