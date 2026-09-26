<?php

namespace App;

final class InteropController
{
    public function show(Customer $customer): void
    {
        $this->render('templates/interop.html.twig', ['customer' => $customer]);
    }
}

