<?php

namespace App;

final class RenderTypeController
{
    public function show(): void
    {
        $person = new RenderCustomer();
        $this->render('templates/render-types.html.twig', ['person' => $person]);
    }
}
