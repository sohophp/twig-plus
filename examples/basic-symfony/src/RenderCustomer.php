<?php

namespace App;

final class RenderCustomer
{
    public function getName(): string
    {
        return 'Ada';
    }

    public function getProfile(): RenderProfile
    {
        return new RenderProfile();
    }
}
